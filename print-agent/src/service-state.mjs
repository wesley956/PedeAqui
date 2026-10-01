import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function agentRoot() {
  return path.resolve(process.env.PEDEAQUI_AGENT_ROOT || moduleRoot);
}

export function agentDataDir() {
  return path.resolve(process.env.PEDEAQUI_AGENT_DATA || path.join(agentRoot(), "data"));
}

export function agentReleasesDir() {
  return path.join(agentRoot(), "releases");
}

export function currentStatePath() {
  return path.join(agentRoot(), "current.json");
}

export function previousStatePath() {
  return path.join(agentRoot(), "previous.json");
}

export function rejectedReleasePath() {
  return path.join(agentRoot(), "rejected-release.json");
}

export function ensureAgentLayout() {
  mkdirSync(agentRoot(), { recursive: true });
  mkdirSync(agentDataDir(), { recursive: true });
  mkdirSync(agentReleasesDir(), { recursive: true });
}

function safeVersion(value) {
  const version = String(value || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid release version: ${value}`);
  return version;
}

function normalizeReleaseState(value) {
  if (!value || typeof value !== "object") throw new Error("invalid release state");
  const version = safeVersion(value.version);
  const releasePath = path.resolve(String(value.releasePath || path.join(agentReleasesDir(), version)));
  const releasesRoot = `${path.resolve(agentReleasesDir())}${path.sep}`.toLowerCase();
  if (!`${releasePath}${path.sep}`.toLowerCase().startsWith(releasesRoot)) {
    throw new Error("release path escapes releases directory");
  }
  return {
    version,
    releasePath,
    pending: Boolean(value.pending),
    attempts: Math.max(0, Number(value.attempts || 0)),
    activatedAt: String(value.activatedAt || new Date().toISOString()),
  };
}

function normalizeRejectedRelease(value) {
  if (!value || typeof value !== "object") throw new Error("invalid rejected release state");
  return {
    version: safeVersion(value.version),
    rejectedAt: String(value.rejectedAt || new Date().toISOString()),
    reason: String(value.reason || "unspecified").trim().slice(0, 120) || "unspecified",
  };
}

function parseJsonFile(filePath) {
  const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(content);
}

export function readReleaseState(filePath = currentStatePath()) {
  try {
    return normalizeReleaseState(parseJsonFile(filePath));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function readRejectedRelease(filePath = rejectedReleasePath()) {
  try {
    return normalizeRejectedRelease(parseJsonFile(filePath));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function writeJsonAtomic(filePath, value) {
  ensureAgentLayout();
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, filePath);
}

export function writeReleaseState(state, filePath = currentStatePath()) {
  const normalized = normalizeReleaseState(state);
  writeJsonAtomic(filePath, normalized);
  return normalized;
}

export function markReleaseRejected(version, reason = "healthcheck_failed") {
  const rejected = normalizeRejectedRelease({
    version,
    rejectedAt: new Date().toISOString(),
    reason,
  });
  writeJsonAtomic(rejectedReleasePath(), rejected);
  return rejected;
}

export function clearRejectedRelease(version) {
  const expected = safeVersion(version);
  const rejected = readRejectedRelease();
  if (!rejected || rejected.version !== expected) return false;
  try {
    unlinkSync(rejectedReleasePath());
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export function activateRelease({ version, releasePath, previous = readReleaseState() }) {
  ensureAgentLayout();
  if (previous) writeReleaseState(previous, previousStatePath());
  return writeReleaseState({
    version,
    releasePath,
    pending: true,
    attempts: 0,
    activatedAt: new Date().toISOString(),
  });
}

export function markCurrentReleaseHealthy(version) {
  const current = readReleaseState();
  if (!current || current.version !== safeVersion(version) || !current.pending) return false;
  writeReleaseState({ ...current, pending: false, attempts: 0 });
  try {
    clearRejectedRelease(version);
  } catch (error) {
    console.error("rejected release marker cleanup failed", error);
  }
  return true;
}

export function markCurrentReleaseAttempt() {
  const current = readReleaseState();
  if (!current?.pending) return current;
  return writeReleaseState({ ...current, attempts: current.attempts + 1 });
}

export function rollbackToPreviousRelease() {
  const current = readReleaseState();
  const previous = readReleaseState(previousStatePath());
  if (!previous) return null;
  if (current?.version && current.version !== previous.version) {
    markReleaseRejected(current.version, "programmatic_rollback");
  }
  return writeReleaseState({ ...previous, pending: false, attempts: 0 });
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export function acquireSingleInstance() {
  ensureAgentLayout();
  const lockPath = path.join(agentDataDir(), "agent.lock");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor;
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
      writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`, "utf8");
      closeSync(descriptor);
      descriptor = undefined;

      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          const owner = parseJsonFile(lockPath);
          if (Number(owner?.pid) === process.pid) unlinkSync(lockPath);
        } catch (error) {
          if (error?.code !== "ENOENT") console.error("single-instance lock cleanup failed", error);
        }
      };
      process.once("exit", release);
      return { lockPath, release };
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch {}
      }
      if (error?.code !== "EEXIST") throw error;

      let ownerPid = null;
      try {
        ownerPid = Number(parseJsonFile(lockPath)?.pid);
      } catch {}
      if (processExists(ownerPid)) {
        const conflict = new Error(`another Print Agent instance is already running (pid ${ownerPid})`);
        conflict.code = "PEDEAQUI_INSTANCE_RUNNING";
        throw conflict;
      }
      try { unlinkSync(lockPath); } catch (unlinkError) {
        if (unlinkError?.code !== "ENOENT") throw unlinkError;
      }
    }
  }

  const error = new Error("could not acquire Print Agent single-instance lock");
  error.code = "PEDEAQUI_INSTANCE_LOCK_FAILED";
  throw error;
}

export function releaseExists(state) {
  return Boolean(state?.releasePath && existsSync(path.join(state.releasePath, "src", "index.mjs")));
}
