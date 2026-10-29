import { copyFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";

const rawRoot = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent";
const allowed = /^(?:src\/[a-z][a-z0-9-]*\.mjs|package\.json|manifest\.json)$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function newer(remote, local) {
  if (!versionPattern.test(local)) return true;
  const a = remote.split(".").map(Number), b = local.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
async function exists(file) { try { await stat(file); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

export async function updateAgent({ rootDir, fetcher = fetch, beforeActivate = () => {}, log = console.log }) {
  const stage = path.join(rootDir, ".update-stage");
  const backup = path.join(rootDir, ".update-backup");
  const journal = path.join(rootDir, ".update-transaction.json");
  const lockFile = path.join(rootDir, ".update-lock");
  let lock;
  await mkdir(rootDir, { recursive: true });
  try {
    try { lock = await open(lockFile, "wx", 0o600); await lock.writeFile(String(process.pid)); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(lockFile, "utf8"));
      if (Number.isInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); return { status: "busy" }; }
        catch (probeError) { if (probeError.code !== "ESRCH") return { status: "busy" }; }
      } else if (Date.now() - (await stat(lockFile)).mtimeMs < 30000) return { status: "busy" };
      await rm(lockFile);
      // Recover on this startup, before the old CMD launcher starts the worker.
      lock = await open(lockFile, "wx", 0o600); await lock.writeFile(String(process.pid));
    }

    async function rollback() {
      if (!(await exists(journal))) return;
      const plan = JSON.parse(await readFile(journal, "utf8"));
      if (!Array.isArray(plan) || plan.length > 30 || plan.some(item => !allowed.test(item.file) || typeof item.existed !== "boolean")) throw new Error("invalid_journal");
      for (const item of plan) {
        const destination = path.join(rootDir, item.file);
        if (item.existed) {
          await copyFile(path.join(backup, item.file), `${destination}.restore`);
          await rename(`${destination}.restore`, destination);
        } else await rm(destination, { force: true });
      }
      // Retain journal and backup if any restoration fails.
      await rm(journal);
      await rm(backup, { recursive: true, force: true });
      await rm(stage, { recursive: true, force: true });
    }
    await rollback();

    const deadline = Date.now() + 90000;
    async function download(relative, maxBytes) {
      if (Date.now() >= deadline) throw new Error("update_deadline");
      const response = await fetcher(`${rawRoot}/${relative}?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(Math.min(12000, deadline - Date.now())) });
      if (!response.ok) throw new Error("download_failed");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("empty_download");
      const parts = [];
      let total = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > maxBytes) { await reader.cancel(); throw new Error("oversized_download"); }
          parts.push(value);
        }
      } finally { reader.releaseLock(); }
      if (!total) throw new Error("empty_download");
      return Buffer.concat(parts);
    }

    const manifestBytes = await download("manifest.json", 32768);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const files = manifest.files;
    if (!versionPattern.test(manifest.version) || !Array.isArray(files) || !files.length || files.length > 30 || new Set(files).size !== files.length || files.some(file => typeof file !== "string" || !allowed.test(file)) || !["src/index.mjs", "src/updater.mjs", "src/updater-core.mjs", "package.json", "manifest.json"].every(file => files.includes(file))) throw new Error("invalid_manifest");
    let currentVersion = "";
    try { currentVersion = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8")).version; } catch {}
    if (!newer(manifest.version, currentVersion)) {
      if (manifest.version !== currentVersion) return { status: "current" };
      let intact = true;
      for (const file of files.filter(file => file !== "manifest.json")) {
        try { if (hash(await readFile(path.join(rootDir, file))) !== manifest.sha256?.[file]) intact = false; }
        catch { intact = false; }
      }
      if (intact) return { status: "current" };
    }

    await rm(stage, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    for (const relative of files) {
      const bytes = relative === "manifest.json" ? manifestBytes : await download(relative, 1048576);
      if (relative !== "manifest.json" && (!/^[a-f0-9]{64}$/.test(manifest.sha256?.[relative] ?? "") || hash(bytes) !== manifest.sha256[relative])) throw new Error("integrity_failed");
      const target = path.join(stage, relative);
      await mkdir(path.dirname(target), { recursive: true });
      const handle = await open(target, "w", 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      if (relative.endsWith(".mjs")) {
        const result = spawnSync(process.execPath, ["--check", target], { windowsHide: true, encoding: "utf8", timeout: 10000 });
        if (result.status !== 0) throw new Error("invalid_javascript");
        for (const match of bytes.toString("utf8").matchAll(/(?:from\s*|import\s*)["'](\.\.?\/[^"']+)["']/g)) {
          const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1]));
          if (!files.includes(dependency)) throw new Error("missing_dependency");
        }
      }
    }
    if (JSON.parse(await readFile(path.join(stage, "package.json"), "utf8")).version !== manifest.version) throw new Error("version_mismatch");

    const ordered = [...files.filter(file => file !== "package.json"), "package.json"];
    const plan = [];
    for (const file of ordered) {
      const present = await exists(path.join(rootDir, file));
      plan.push({ file, existed: present });
      if (present) {
        await mkdir(path.dirname(path.join(backup, file)), { recursive: true });
        await copyFile(path.join(rootDir, file), path.join(backup, file));
      }
    }
    const handle = await open(`${journal}.tmp`, "w", 0o600);
    try { await handle.writeFile(JSON.stringify(plan)); await handle.sync(); } finally { await handle.close(); }
    await rename(`${journal}.tmp`, journal);
    try {
      for (const file of ordered) {
        await beforeActivate(file);
        const destination = path.join(rootDir, file);
        await mkdir(path.dirname(destination), { recursive: true });
        await copyFile(path.join(stage, file), `${destination}.next`);
        await rename(`${destination}.next`, destination);
      }
      await rm(journal);
    } catch (error) { await rollback(); throw error; }
    await rm(backup, { recursive: true, force: true });
    await rm(stage, { recursive: true, force: true });
    log(`PedeAqui Print Agent updated ${currentVersion || "unknown"} -> ${manifest.version}`);
    return { status: "updated" };
  } finally {
    if (lock) { await lock.close().catch(() => {}); await rm(lockFile, { force: true }).catch(() => {}); }
  }
}
