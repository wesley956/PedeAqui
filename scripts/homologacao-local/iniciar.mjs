#!/usr/bin/env node
// Homologação LOCAL do PedeAqui (UX2): banco Supabase local só com loja fictícia + o sistema em rede local.
// Não usa nenhuma chave de produção, WhatsApp, pagamento, iFood, fiscal ou impressão.
//
//   node scripts/homologacao-local/iniciar.mjs              sobe tudo e deixa rodando (Ctrl+C para parar o sistema)
//   node scripts/homologacao-local/iniciar.mjs --zerar      apaga o banco local e recria a loja fictícia
//   node scripts/homologacao-local/iniciar.mjs --verificar  sobe, confere as telas principais e encerra (usado no CI)
//   node scripts/homologacao-local/iniciar.mjs --parar      desliga o banco local
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
process.chdir(root);
const args = new Set(process.argv.slice(2));
const verify = args.has("--verificar");
// --compilado: versão compilada (rápida e estável) em 127.0.0.1, para a auditoria com prints no CI. Não serve para o celular.
const compiled = args.has("--compilado");
const workdir = "homolog-local"; // pasta própria do Supabase local: não toca em supabase/ do projeto
const dbContainer = `supabase_db_${workdir}`;
const supabaseVersion = "2.84.2";
const appPort = Number(process.env.HOMOLOG_PORT ?? 3000);
const login = { email: "dono.teste@example.com", password: "Homologacao-Local-2026" };
const stateFile = path.join(workdir, "estado.json");

const say = (text) => console.log(`\n▶ ${text}`);
const fail = (text) => { console.error(`\n✖ ${text}\n`); process.exit(1); };

/** Roda um comando pelo shell (necessário no Windows para npx/supabase) e devolve a saída. */
function run(command, { input, allowFail = false, quiet = true, env } = {}) {
  const result = spawnSync(command, { shell: true, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0 && !allowFail) fail(`Comando falhou: ${command}\n${(result.stderr || result.stdout || "").trim().split("\n").slice(-15).join("\n")}`);
  return { ok: result.status === 0, out: result.stdout ?? "", err: result.stderr ?? "" };
}

function has(command) { return run(command, { allowFail: true }).ok; }

function lanAddress() {
  if (verify || process.env.HOMOLOG_HOST) return process.env.HOMOLOG_HOST ?? "127.0.0.1";
  const candidates = Object.values(os.networkInterfaces()).flat().filter((entry) => entry && entry.family === "IPv4" && !entry.internal).map((entry) => entry.address);
  // Prefere a rede de casa/escritório; ignora redes virtuais do Docker/WSL quando houver outra.
  return candidates.find((ip) => ip.startsWith("192.168.")) ?? candidates.find((ip) => ip.startsWith("10.")) ?? candidates[0] ?? "127.0.0.1";
}

// ---------- 1. Programas necessários ----------
say("Conferindo o que precisa estar instalado");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) fail(`Node ${process.versions.node} encontrado; é preciso Node 22 ou mais novo (https://nodejs.org).`);
if (!has("docker --version")) fail("Docker não encontrado. Instale o Docker Desktop (https://www.docker.com/products/docker-desktop) e abra-o.");
if (!has("docker info")) fail("O Docker está instalado mas não está rodando. Abra o Docker Desktop, espere ficar pronto e rode de novo.");
const supabase = has("supabase --version") ? "supabase" : `npx --yes supabase@${supabaseVersion}`;
console.log(`  Node ${process.versions.node} · Docker ok · Supabase CLI: ${supabase === "supabase" ? "instalada" : "via npx"}`);
if (/onedrive/i.test(root)) console.log("  ⚠ Esta pasta está dentro do OneDrive. A sincronização de milhares de arquivos (node_modules, .next) deixa tudo lento e pode travar arquivos. Pause a sincronização do OneDrive enquanto usa, ou mova a pasta para fora (ex.: C:\\pedeaqui-ux2).");

if (args.has("--parar")) {
  run(`${supabase} stop --workdir ${workdir}`, { allowFail: true });
  console.log("Banco local desligado.");
  process.exit(0);
}

// ---------- 2. Dependências do projeto ----------
if (!fs.existsSync("node_modules/next")) {
  say("Instalando as dependências do projeto (só na primeira vez; leva alguns minutos)");
  run("npm install --legacy-peer-deps --no-audit --no-fund", { quiet: true });
}

// ---------- 3. Banco local ----------
say("Subindo o banco local (Supabase em Docker)");
fs.mkdirSync(workdir, { recursive: true });
if (args.has("--zerar")) {
  run(`${supabase} stop --no-backup --workdir ${workdir}`, { allowFail: true });
  fs.rmSync(stateFile, { force: true });
}
if (!fs.existsSync(path.join(workdir, "supabase", "config.toml"))) run(`${supabase} init --force --workdir ${workdir}`);
run(`${supabase} start --workdir ${workdir} -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor`);
const statusEnv = Object.fromEntries(run(`${supabase} status -o env --workdir ${workdir}`).out.split("\n").map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((match) => [match[1], match[2]]));
const anonKey = statusEnv.ANON_KEY ?? statusEnv.PUBLISHABLE_KEY;
const serviceKey = statusEnv.SERVICE_ROLE_KEY ?? statusEnv.SECRET_KEY;
if (!anonKey || !serviceKey) fail("Não consegui ler as chaves do Supabase local (supabase status).");

function psql(sql, { variables = {}, allowFail = false, singleTransaction = false } = {}) {
  const vars = Object.entries(variables).map(([key, value]) => `-v ${key}=${value}`).join(" ");
  return run(`docker exec -i ${dbContainer} psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 ${singleTransaction ? "--single-transaction" : ""} ${vars}`, { input: sql, allowFail });
}

const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
if (!state) {
  say("Criando as tabelas do sistema no banco local");
  psql("create extension if not exists pg_cron with schema extensions;");
  const numeric = (name) => Number(name.match(/^(\d+)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  const files = fs.readdirSync("supabase/sql").filter((name) => name.endsWith(".sql")).sort((a, b) => numeric(a) - numeric(b) || (a < b ? -1 : a > b ? 1 : 0));
  for (const file of files) {
    const applied = psql(fs.readFileSync(path.join("supabase/sql", file), "utf8"), { allowFail: true });
    if (!applied.ok) fail(`Falha ao aplicar supabase/sql/${file}\n${applied.err.trim().split("\n").slice(-6).join("\n")}`);
  }
  // Mudanças que existem só nas migrações versionadas (ainda não incorporadas ao schema canônico).
  // Cada uma é aplicada isolada; as que já existem falham e são ignoradas.
  const deltas = [
    "20260910162000_scheduled_product_promotions.sql", "20260911180613_promotion_campaigns_v2.sql", "20260912003740_whatsapp_direct_orders.sql",
    "20260912051915_whatsapp_bot_presentation_settings.sql", "20260915155500_int11_order_creation_channel.sql", "20260916150000_wpp04_inbox_pagination.sql",
    "20260917214500_wpp07_atomic_human_claim.sql", "20260924064200_saas_06_private_promotion_schedule_rpc.sql",
    "20261111224213_public_item_notes_setting.sql", "20261112112911_waiting_queue_answered_auto_close.sql", "20261112231738_safe_unanswered_bot_recovery.sql",
  ];
  const skipped = [];
  for (const file of deltas) {
    const full = path.join("supabase/migrations", file);
    if (!fs.existsSync(full) || !psql(fs.readFileSync(full, "utf8"), { allowFail: true, singleTransaction: true }).ok) skipped.push(file);
  }
  console.log(`  ${files.length} arquivos de schema aplicados; ${deltas.length - skipped.length} migrações extras aplicadas${skipped.length ? `, ${skipped.length} ignoradas` : ""}.`);

  say("Criando a loja fictícia (Salgados da Vila)");
  const seedEnv = { ...process.env, LOCAL_SUPABASE_URL: "http://127.0.0.1:54321", LOCAL_ANON_KEY: anonKey, LOCAL_SERVICE_KEY: serviceKey, AUDIT_EMAIL: login.email, AUDIT_PASSWORD: login.password };
  const ids = JSON.parse(run("node scripts/homologacao-local/seed.mjs", { env: seedEnv }).out.trim().split("\n").pop());
  const seeded = psql(fs.readFileSync("scripts/homologacao-local/seed.sql", "utf8"), { variables: { org: ids.org, store: ids.store, usr: ids.user } });
  const summary = seeded.out.split("\n").find((line) => line.includes("SEED_SUMMARY")) ?? "";
  const warnings = (seeded.err.match(/WARNING: {2}SEED[^\n]*/g) ?? []);
  console.log(`  ${summary.trim() || "loja criada"}${warnings.length ? `\n  Avisos do seed (${warnings.length}):\n  ${warnings.slice(0, 8).join("\n  ")}` : ""}`);
  fs.writeFileSync(stateFile, JSON.stringify({ ...ids, createdAt: new Date().toISOString(), seedSummary: summary.trim(), seedWarnings: warnings }, null, 1));
} else {
  console.log(`  Banco já preparado em ${state.createdAt} (use --zerar para recomeçar do zero).`);
}

// ---------- 4. Sistema em rede local ----------
const host = compiled ? "127.0.0.1" : lanAddress();
const supabaseUrl = `http://${host}:54321`;
const appUrl = `http://${host}:${appPort}`;
const appEnv = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  APP_URL: appUrl,
  LOGIN_GUARD_SECRET: "homologacao-local-apenas",
  CRON_SECRET: "homologacao-local-apenas",
  // Lido só em modo de desenvolvimento por next.config.ts: libera o Supabase local e o acesso pela rede.
  PEDEAQUI_HOMOLOG_HOST: host,
};
// Garante que nenhuma chave de integração externa vaze do ambiente do computador para a homologação.
for (const key of Object.keys(appEnv)) if (/^(META_|WHATSAPP_|MERCADO_PAGO_|PAGBANK_|SUPPORT_MODE_SECRET|PUBLIC_APP_URL)/.test(key)) delete appEnv[key];

let restoreConfig = () => {};
if (compiled) {
  // A liberação do Supabase local em next.config.ts só vale em desenvolvimento. Para compilar apontando para o banco
  // local, o arquivo é ajustado durante a execução e restaurado no fim. Usado só em cópia descartável (CI).
  const configFile = path.join(root, "next.config.ts");
  const original = fs.readFileSync(configFile, "utf8");
  const patched = original.replace("const homologHost = isDevelopment ? process.env.PEDEAQUI_HOMOLOG_HOST?.trim() : undefined;", "const homologHost = process.env.PEDEAQUI_HOMOLOG_HOST?.trim();");
  if (patched === original) fail("Não foi possível preparar next.config.ts para a versão compilada.");
  fs.writeFileSync(configFile, patched);
  restoreConfig = () => fs.writeFileSync(configFile, original);
  say("Compilando o sistema (alguns minutos)");
  const build = spawnSync("npx next build", { shell: true, cwd: root, env: appEnv, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (build.status !== 0) { restoreConfig(); fail(`A compilação falhou.\n${`${build.stdout}\n${build.stderr}`.split("\n").slice(-40).join("\n")}`); }
}

say("Iniciando o sistema");
const app = spawn(compiled ? `npx next start --hostname 127.0.0.1 --port ${appPort}` : `npx next dev --hostname 0.0.0.0 --port ${appPort}`, { shell: true, env: appEnv, stdio: verify ? ["ignore", "pipe", "pipe"] : "inherit" });
let appLog = "";
if (verify) for (const stream of [app.stdout, app.stderr]) stream.on("data", (chunk) => { appLog += chunk; });
const stop = () => { restoreConfig(); try { if (process.platform === "win32") spawnSync(`taskkill /pid ${app.pid} /T /F`, { shell: true }); else app.kill("SIGTERM"); } catch { /* já encerrado */ } };
process.on("SIGINT", () => { stop(); process.exit(0); });

async function waitFor(url, seconds) {
  for (let attempt = 0; attempt < seconds / 2; attempt += 1) {
    try { const response = await fetch(url, { redirect: "manual" }); if (response.status < 500) return response.status; } catch { /* ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

const ready = await waitFor(`http://127.0.0.1:${appPort}/login`, 240);
if (!ready) { stop(); fail(`O sistema não respondeu em 4 minutos.\n${appLog.split("\n").slice(-20).join("\n")}`); }

if (verify) {
  const checks = [];
  for (const route of ["/login", "/m/salgados-da-vila", "/dashboard", "/api/health"]) {
    const response = await fetch(`http://127.0.0.1:${appPort}${route}`, { redirect: "manual" }).catch(() => null);
    checks.push(`${route}=${response?.status ?? "erro"}`);
  }
  const auth = await fetch(`http://127.0.0.1:54321/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anonKey, "content-type": "application/json" }, body: JSON.stringify(login) }).then((response) => response.status).catch(() => "erro");
  const saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  console.log(`HOMOLOG_VERIFY ${checks.join(" ")} login=${auth} ${saved.seedSummary} avisos=${saved.seedWarnings.length}`);
  for (const warning of saved.seedWarnings) console.log(`HOMOLOG_SEED_WARNING ${warning}`);
  const ok = checks[0].endsWith("=200") && checks[1].endsWith("=200") && auth === 200;
  // HOMOLOG_APOS: comando executado com o sistema no ar (ex.: auditoria com prints no CI), antes de encerrar.
  let afterStatus = 0;
  if (ok && process.env.HOMOLOG_APOS) {
    afterStatus = spawnSync(process.env.HOMOLOG_APOS, { shell: true, stdio: "inherit", env: { ...process.env, PANEL_BASE: `http://127.0.0.1:${appPort}`, AUDIT_EMAIL: login.email, AUDIT_PASSWORD: login.password } }).status ?? 1;
    console.log(`HOMOLOG_APOS status=${afterStatus}`);
  }
  stop();
  process.exit(ok && afterStatus === 0 ? 0 : 1);
}

console.log(`
══════════════════════════════════════════════════════════
  PedeAqui — homologação local no ar

  Neste computador:   http://localhost:${appPort}
  No celular (Wi-Fi): ${appUrl}
  Cardápio da loja:   ${appUrl}/m/salgados-da-vila

  Entrar no painel:   ${login.email}
  Senha:              ${login.password}

  Loja fictícia, banco só neste computador. Não envia WhatsApp,
  não cobra e não imprime. Para parar: Ctrl+C nesta janela.
  Se o celular não abrir, libere as portas ${appPort} e 54321 no
  firewall do Windows para a rede privada.
══════════════════════════════════════════════════════════
`);
