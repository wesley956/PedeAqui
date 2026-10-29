import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDiagnostic } from "./diagnostic-collector.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createDiagnosticController({ apiUrl, token, post, version, directory = path.join(root, ".diagnostics"), collect = collectDiagnostic, now = Date.now, log = console.error }) {
  // Separate local state for a rotated credential; never reuse another store's
  // pending report after reconnection. The key itself is never written here.
  const scope = createHash("sha256").update(`${apiUrl}\n${token}`).digest("hex").slice(0, 24);
  const scopeDir = path.join(directory, scope);
  let busy = false;
  let failures = 0;
  let retryAfter = 0;
  let pendingId = null;
  let pendingExpiry = 0;
  const completed = new Set();

  async function persist(file, value) {
    const temporary = `${file}.${process.pid}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, file);
  }

  async function handle(command) {
    if (command && uuid.test(command.id) && Number.isFinite(Date.parse(command.expiresAt)) && Date.parse(command.expiresAt) > now() && !completed.has(command.id)) {
      pendingId = command.id; pendingExpiry = Date.parse(command.expiresAt);
    }
    if (busy || !pendingId || now() < retryAfter) return;
    busy = true;
    const id = pendingId;
    let lock;
    const file = path.join(scopeDir, `${id}.json`);
    const lockFile = path.join(scopeDir, `${id}.lock`);
    try {
      await mkdir(scopeDir, { recursive: true });
      // A live sibling must not collect the same request in parallel.
      try { lock = await open(lockFile, "wx", 0o600); await lock.writeFile(String(process.pid)); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        const pid = Number(await readFile(lockFile, "utf8"));
        try { process.kill(pid, 0); return; }
        catch (probeError) { if (probeError.code !== "ESRCH") return; }
        await unlink(lockFile);
        return; // next heartbeat acquires it normally
      }
      let state;
      try { state = JSON.parse(await readFile(file, "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (state?.status === "sent" || state?.status === "discarded") { completed.add(id); pendingId = null; return; }
      if (pendingExpiry <= now()) { await persist(file, { status: "discarded" }); pendingId = null; return; }
      if (!state) {
        // Save before probing. After a crash return an interrupted report rather
        // than silently collecting a second time for the same human request.
        const startedAt = new Date(now()).toISOString();
        await persist(file, { status: "collecting", startedAt });
        let report;
        try { report = await collect({ apiUrl, post, version, directory: scopeDir }); }
        catch { report = interruptedReport(startedAt, "collection_failed"); }
        state = { status: "ready", report };
        await persist(file, state);
      } else if (state.status === "collecting") {
        state = { status: "ready", report: interruptedReport(state.startedAt, "interrupted") };
        await persist(file, state);
      }
      const response = await post("/api/print-agent/diagnostics/result", { requestId: id, report: state.report });
      if (!["completed", "cancelled", "expired", "unavailable"].includes(response.status)) throw new Error("invalid_diagnostic_response");
      await persist(file, { status: response.status === "completed" ? "sent" : "discarded" });
      completed.add(id);
      pendingId = null;
      failures = 0; retryAfter = 0;
    } catch (error) {
      // Even a full/read-only disk should be diagnosable. In this degraded mode
      // send only the storage failure, without running non-persistable probes.
      if (["EACCES", "EPERM", "ENOSPC", "EROFS"].includes(error?.code)) {
        const minimal = interruptedReport(new Date(now()).toISOString(), "storage_failed");
        minimal.checks = [{ name: "storage", status: "error", code: "storage_failed", values: { writable: false } }];
        try {
          const response = await post("/api/print-agent/diagnostics/result", { requestId: id, report: minimal });
          if (["completed", "cancelled", "expired", "unavailable"].includes(response.status)) {
            completed.add(id); pendingId = null; return;
          }
        } catch { /* Backoff below also applies when disk and network fail. */ }
      }
      failures += 1;
      retryAfter = now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(failures - 1, 5));
      log("Diagnostic request pending; retrying on a later heartbeat.");
    } finally {
      if (lock) { await lock.close().catch(() => {}); await unlink(lockFile).catch(() => {}); }
      busy = false;
    }
  }

  function interruptedReport(startedAt, code) {
    return { schemaVersion: 1, agentVersion: version, platform: ["win32", "linux", "darwin"].includes(process.platform) ? process.platform : "other", startedAt, finishedAt: new Date(now()).toISOString(), checks: [{ name: "runtime", status: "error", code, values: {} }] };
  }
  return { handle, get busy() { return busy; } };
}
