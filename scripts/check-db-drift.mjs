import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function inspectSqlHistory(fileNames) {
  const files = fileNames.filter((name) => name.endsWith(".sql")).sort();
  const parsed = files.map((name) => {
    const match = name.match(/^(\d+)_/);
    if (!match) throw new Error(`Migration SQL sem prefixo numérico: ${name}`);
    return { name, prefix: Number(match[1]) };
  });
  const counts = new Map();
  for (const item of parsed) counts.set(item.prefix, (counts.get(item.prefix) ?? 0) + 1);
  const max = Math.max(...parsed.map((item) => item.prefix));
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([prefix]) => prefix);
  const missing = Array.from({ length: max }, (_, index) => index + 1).filter((prefix) => !counts.has(prefix));
  return { files, duplicates, missing, max };
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
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
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

export function localDriftErrors({ sqlFiles, baseline }) {
  const errors = validateProductionBaseline(baseline);
  const history = inspectSqlHistory(sqlFiles);
  if (history.duplicates.join(",") !== "14") errors.push(`Prefixos duplicados inesperados: ${history.duplicates.join(",") || "nenhum"}`);
  if (history.missing.join(",") !== "17") errors.push(`Lacunas históricas inesperadas: ${history.missing.join(",") || "nenhuma"}`);
  if (history.files.at(-1) !== "90_onboarding_role_permission_conflict_hotfix.sql") {
    errors.push(`Cauda SQL inesperada: ${history.files.at(-1) ?? "nenhuma"}`);
  }
  const remoteTail = baseline.migrations.at(-1);
  if (!remoteTail || remoteTail[1] !== "onboarding_role_permission_conflict_hotfix") {
    errors.push("Baseline remoto não termina no hotfix de onboarding reconciliado.");
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
  const baselinePath = path.join(repoRoot, "supabase/production-migrations.json");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const localErrors = localDriftErrors({ sqlFiles: fs.readdirSync(sqlDir), baseline });
  if (localErrors.length) return fail(localErrors);

  const remoteFileIndex = process.argv.indexOf("--remote-file");
  if (remoteFileIndex >= 0) {
    const remotePath = process.argv[remoteFileIndex + 1];
    if (!remotePath) return fail(["--remote-file requer um caminho."]);
    const actual = parseRemoteLines(fs.readFileSync(remotePath, "utf8"));
    const remoteErrors = compareMigrationHistory(baseline.migrations, actual);
    if (remoteErrors.length) return fail(remoteErrors);
    console.log(`DB_DRIFT: remoto confere com ${baseline.migrations.length} migrations versionadas.`);
    return;
  }

  console.log(`DB_DRIFT: histórico local válido; baseline de produção possui ${baseline.migrations.length} migrations.`);
  console.log("DB_DRIFT: comparação remota é somente leitura e roda no CI quando SUPABASE_DB_URL estiver configurado.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
