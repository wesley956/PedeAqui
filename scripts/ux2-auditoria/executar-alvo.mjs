// Executa o mesmo roteiro contra um lote de release em checkout descartável do CI.
// Os arquivos de src/ do alvo permanecem exatamente no commit registrado em target.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

function replaceOnce(source, from, to) {
  if (source.split(from).length !== 2) throw new Error(`Configuração de homologação não reconhecida: ${from}`);
  return source.replace(from, to);
}

export function localDatabaseConfig(source, reference) {
  if (source.includes("const homologHost =")) {
    if (!source.includes("${homologImages}") || !source.includes("${homologConnect}")) throw new Error("Configuração local incompleta no alvo.");
    return source;
  }
  const declarations = reference.match(/^const homolog(?:Host|Valid|Connect|Images) = .+;$/gm);
  if (declarations?.length !== 4) throw new Error("Referência de homologação não reconhecida.");
  const anchor = 'const isGitHubPages = process.env.GITHUB_PAGES === "true";';
  let configured = replaceOnce(source, anchor, `${anchor}\n${declarations.join("\n")}`);
  configured = replaceOnce(configured, '"img-src \'self\' data: blob: https:"', "`img-src 'self' data: blob: https:${homologImages}`");
  return replaceOnce(configured, '"connect-src \'self\' https: wss:"', "`connect-src 'self' https: wss:${homologConnect}`");
}

export function validateTargetRef(ref) {
  if (!/^release\/ux2-[a-z0-9-]+$/.test(ref)) throw new Error("O alvo deve ser uma branch release/ux2-* deste repositório.");
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const targetRef = process.argv[2] ?? "";
  const modes = process.argv.slice(3);
  if (modes.some((mode) => mode !== "--compilado")) throw new Error("Modo de homologação não reconhecido.");
  let application = root;
  let environment = { ...process.env };
  if (targetRef) {
    validateTargetRef(targetRef);
    if (process.env.CI !== "true") throw new Error("O checkout descartável de release só pode ser preparado no CI.");
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    git("fetch", "--no-tags", "--depth=1", "origin", `refs/heads/${targetRef}`);
    const applicationCommit = git("rev-parse", "FETCH_HEAD");
    const harnessCommit = git("rev-parse", "HEAD");
    if (git("rev-parse", `${applicationCommit}:package-lock.json`) !== git("rev-parse", "HEAD:package-lock.json")) {
      throw new Error("O lote usa dependências diferentes; preparar sua instalação antes de homologar.");
    }
    application = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pedeaqui-release-")), "app");
    git("worktree", "add", "--detach", application, applicationCommit);
    for (const directory of ["homologacao-local", "ux2-auditoria"]) {
      fs.cpSync(path.join(root, "scripts", directory), path.join(application, "scripts", directory), { recursive: true });
    }
    fs.cpSync(path.join(root, "node_modules"), path.join(application, "node_modules"), { recursive: true, verbatimSymlinks: true });
    const configPath = path.join(application, "next.config.ts");
    fs.writeFileSync(configPath, localDatabaseConfig(fs.readFileSync(configPath, "utf8"), fs.readFileSync(path.join(root, "next.config.ts"), "utf8")));
    git("-C", application, "diff", "--exit-code", applicationCommit, "--", "src");
    const out = path.resolve(process.env.AUDIT_OUT || "ux2-auditoria-out");
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "target.json"), JSON.stringify({ ref: targetRef, applicationCommit, harnessCommit, configuration: "CSP adaptada somente ao banco local; src/ intacto", scope: "fluxo crítico; Salão separado" }, null, 2));
    console.log(`HOMOLOG_TARGET ref=${targetRef} application=${applicationCommit} harness=${harnessCommit}`);
    environment = { ...environment, AUDIT_CORE_ONLY: "1", AUDIT_EXTRA_SIZES: "1" };
  }
  const result = spawnSync(process.execPath, [path.join(application, "scripts/homologacao-local/iniciar.mjs"), "--verificar", ...modes], { cwd: application, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
