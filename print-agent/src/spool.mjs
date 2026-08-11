import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = process.env.PEDEAQUI_PRINT_SPOOL || join(process.cwd(), ".spool");

async function ensure() { await mkdir(directory, { recursive: true }); }
function pathFor(id) { return join(directory, `${id}.json`); }

export async function saveSpool(job, state, extra = {}) {
  await ensure();
  const target = pathFor(job.id);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify({ job, state, ...extra, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  await rename(temporary, target);
}

export async function removeSpool(id) {
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
