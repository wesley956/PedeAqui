import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function migrationPrefix(name) {
  const match = name.match(/^(\d+)_/);
  if (!match) throw new Error(`Migration SQL sem prefixo numérico: ${name}`);
  return Number(match[1]);
}

function migrationName(name) {
  return name.replace(/^\d+_/, "").replace(/\.sql$/, "");
}

export function inspectSqlHistory(fileNames) {
  const files = fileNames
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => migrationPrefix(a) - migrationPrefix(b) || a.localeCompare(b));
  const parsed = files.map((name) => ({ name, prefix: migrationPrefix(name), migrationName: migrationName(name) }));
  const counts = new Map();
  for (const item of parsed) counts.set(item.prefix, (counts.get(item.prefix) ?? 0) + 1);
  const max = Math.max(...parsed.map((item) => item.prefix));
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([prefix]) => prefix);
  const missing = Array.from({ length: max }, (_, index) => index + 1).filter((prefix) => !counts.has(prefix));
  return { files, parsed, duplicates, missing, max };
}

export function validateProductionBaseline(baseline) {
  if (!baseline || typeof baseline.projectRef !== "string" || !Array.isArray(baseline.migrations)) {
    return ["Baseline de produção inválido: projectRef/migrations ausentes."];
  }
  const errors = [];
  let previous = "";
  const seen = new Set();
  for (const entry of baseline.migrations) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      errors.push("Baseline contém uma entrada que não é [version, name].");
      continue;
    }
    const [version, name] = entry.map(String);
    if (!/^\d{14}$/.test(version)) errors.push(`Versão inválida no baseline: ${version}`);
    if (!/^[a-z0-9_]+$/.test(name)) errors.push(`Nome inválido no baseline: ${name}`);
    if (seen.has(version)) errors.push(`Versão duplicada no baseline: ${version}`);
    if (previous && version <= previous) errors.push(`Baseline fora de ordem: ${version} após ${previous}`);
    previous = version;
    seen.add(version);
  }
  return errors;
}

export function parseRemoteLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("|");
      if (separator < 1) throw new Error(`Linha remota inválida: ${line.slice(0, 80)}`);
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    });
}

export function compareMigrationHistory(expected, actual) {
  const errors = [];
  const max = Math.max(expected.length, actual.length);
  for (let index = 0; index < max; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (!want && got) {
      errors.push(`Migration existe no remoto e falta no baseline Git: ${got[0]} ${got[1]}`);
      continue;
    }
    if (want && !got) {
      errors.push(`Migration existe no baseline Git e falta no remoto: ${want[0]} ${want[1]}`);
      continue;
    }
    if (want[0] !== got[0] || want[1] !== got[1]) {
      errors.push(`Divergência na posição ${index + 1}: esperado ${want[0]} ${want[1]}, remoto ${got[0]} ${got[1]}`);
    }
  }
  return errors;
}

export function mergeProductionBaseline(base, tail) {
  return {
    ...base,
    migrations: [...(base?.migrations ?? []), ...(tail?.migrations ?? [])],
  };
}

export function localDriftErrors({ sqlFiles, migrationFiles = [], baseline }) {
  const errors = validateProductionBaseline(baseline);
  const history = inspectSqlHistory(sqlFiles);
  if (history.duplicates.join(",") !== "14") {
    errors.push(`Prefixos duplicados inesperados: ${history.duplicates.join(",") || "nenhum"}`);
  }
  if (history.missing.join(",") !== "17") {
    errors.push(`Lacunas históricas inesperadas: ${history.missing.join(",") || "nenhuma"}`);
  }

  const remoteTail = baseline.migrations.at(-1);
  if (!remoteTail) {
    errors.push("Baseline remoto não possui migrations.");
    return errors;
  }

  // O projeto possui dois formatos históricos de migrations versionadas:
  // supabase/sql usa prefixos sequenciais antigos e supabase/migrations usa timestamps.
  // A cauda de produção precisa existir em pelo menos uma dessas fontes canônicas,
  // mas o timestamp local não precisa coincidir com a versão gravada pelo deploy remoto.
  const canonicalFiles = [...sqlFiles, ...migrationFiles].filter((name) => name.endsWith(".sql"));
  const productionTailFiles = canonicalFiles.filter((name) => migrationName(name) === remoteTail[1]);
  if (productionTailFiles.length === 0) {
    errors.push(`Migration da cauda de produção não existe nas fontes canônicas: ${remoteTail[1]}`);
    return errors;
  }

  return errors;
}

function fail(errors) {
  for (const error of errors) console.error(`DB_DRIFT: ${error}`);
  console.error("DB_DRIFT: nenhuma alteração foi feita no Supabase. Reconcile o Git/baseline antes de prosseguir.");
  process.exitCode = 1;
}

function runCli() {
  const sqlDir = path.join(repoRoot, "supabase/sql");
  const migrationsDir = path.join(repoRoot, "supabase/migrations");
  const baselinePath = path.join(repoRoot, "supabase/production-migrations.json");
  const tailPath = path.join(repoRoot, "supabase/production-migrations-tail.json");
  const base = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const tail = fs.existsSync(tailPath) ? JSON.parse(fs.readFileSync(tailPath, "utf8")) : { migrations: [] };
  const baseline = mergeProductionBaseline(base, tail);
  const sqlFiles = fs.readdirSync(sqlDir);
  const migrationFiles = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir) : [];
  const localErrors = localDriftErrors({ sqlFiles, migrationFiles, baseline });
  if (localErrors.length) return fail(localErrors);

  const history = inspectSqlHistory(sqlFiles);
  const productionTailName = baseline.migrations.at(-1)?.[1];
  const legacyTail = history.parsed.find((item) => item.migrationName === productionTailName);
  const pendingLocal = legacyTail ? history.parsed.filter((item) => item.prefix > legacyTail.prefix) : [];

  const allowedArgs = new Set(["--remote-file"]);
  const optionArgs = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
  const unknownArgs = optionArgs.filter((arg) => !allowedArgs.has(arg));
  if (unknownArgs.length) return fail([`Argumento(s) desconhecido(s): ${unknownArgs.join(", ")}`]);

  const remoteFileIndex = process.argv.indexOf("--remote-file");
  if (remoteFileIndex >= 0) {
    const remotePath = process.argv[remoteFileIndex + 1];
    if (!remotePath) return fail(["--remote-file requer um caminho."]);
    const actual = parseRemoteLines(fs.readFileSync(remotePath, "utf8"));
    const remoteErrors = compareMigrationHistory(baseline.migrations, actual);
    if (remoteErrors.length) return fail(remoteErrors);
    console.log(`DB_DRIFT: remoto confere com ${baseline.migrations.length} migrations versionadas.`);
    if (pendingLocal.length) console.log(`DB_DRIFT: ${pendingLocal.length} migration(s) SQL local(is) aguardando promoção.`);
    return;
  }

  console.log(`DB_DRIFT: histórico local válido; baseline de produção possui ${baseline.migrations.length} migrations.`);
  if (pendingLocal.length) console.log(`DB_DRIFT: ${pendingLocal.length} migration(s) SQL local(is) aguardando promoção.`);
  console.log("DB_DRIFT: comparação remota é somente leitura e deve ser obrigatória no CI.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
