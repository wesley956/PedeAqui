import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = process.env.PEDEAQUI_PRINT_SPOOL || join(agentRoot, ".spool");
const legacyDirectory = join(process.cwd(), ".spool");
let legacyMigrationAttempted = false;

async function migrateLegacySpool() {
  if (legacyMigrationAttempted || legacyDirectory === directory) return;
  legacyMigrationAttempted = true;
  let names;
  try {
    names = await readdir(legacyDirectory);
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("legacy spool scan failed", error);
    return;
  }

  await mkdir(directory, { recursive: true });
  for (const name of names.filter((value) => value.endsWith(".json"))) {
    const source = join(legacyDirectory, name);
    const target = join(directory, name);
    try {
      const content = await readFile(source);
      await writeFile(target, content, { flag: "wx" }).catch((error) => {
        if (error?.code !== "EEXIST") throw error;
      });
      await unlink(source).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      });
    } catch (error) {
      console.error("legacy spool migration failed", name, error);
    }
  }
}

async function ensure() {
  await mkdir(directory, { recursive: true });
  await migrateLegacySpool();
}

function pathFor(id) { return join(directory, `${id}.json`); }

export async function saveSpool(job, state, extra = {}) {
  await ensure();
  const target = pathFor(job.id);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify({ job, state, ...extra, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  await rename(temporary, target);
}

export async function removeSpool(id) {
  await ensure();
  await unlink(pathFor(id)).catch((error) => { if (error?.code !== "ENOENT") throw error; });
}

export async function listSpool() {
  await ensure();
  const names = await readdir(directory);
  const entries = [];
  for (const name of names.filter((value) => value.endsWith(".json"))) {
    try { entries.push(JSON.parse(await readFile(join(directory, name), "utf8"))); }
    catch (error) { console.error("invalid spool entry", name, error); }
  }
  return entries;
}
