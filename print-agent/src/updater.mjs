import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  activateRelease,
  agentReleasesDir,
  readRejectedRelease,
  readReleaseState,
} from "./service-state.mjs";

const releaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawRoot = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent";
const manifestUrl = `${rawRoot}/manifest.json`;

function safeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`invalid update path: ${value}`);
  }
  return normalized;
}

function versionParts(value) {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
}

function isNewerVersion(remote, current) {
  const left = versionParts(remote);
  const right = versionParts(current);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return false;
}

async function fetchBuffer(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`download failed: ${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error(`empty update file: ${url}`);
  return buffer;
}

async function localVersion() {
  try {
    const parsed = JSON.parse((await readFile(path.join(releaseRoot, "package.json"), "utf8")).replace(/^\uFEFF/, ""));
    return String(parsed?.version || "");
  } catch {
    return "";
  }
}

function validateModule(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], {
    windowsHide: true,
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`invalid JavaScript update: ${result.stderr || result.stdout || filePath}`);
  }
}

function validateInstalledRelease(releasePath, version) {
  const packagePath = path.join(releasePath, "package.json");
  const indexPath = path.join(releasePath, "src", "index.mjs");
  const bootstrapPath = path.join(releasePath, "src", "service-bootstrap.mjs");
  const statePath = path.join(releasePath, "src", "service-state.mjs");
  if (![packagePath, indexPath, bootstrapPath, statePath].every((value) => existsSync(value))) return false;
  try {
    const parsed = JSON.parse(readFileSync(packagePath, "utf8").replace(/^\uFEFF/, ""));
    return String(parsed?.version || "") === version;
  } catch {
    return false;
  }
}

async function stageRelease(manifest, manifestBuffer) {
  const remoteVersion = String(manifest.version).trim();
  const releasesDir = agentReleasesDir();
  const finalDir = path.join(releasesDir, remoteVersion);
  if (validateInstalledRelease(finalDir, remoteVersion)) return finalDir;

  const stagingDir = path.join(releasesDir, `.${remoteVersion}.staging-${process.pid}-${Date.now()}`);
  await mkdir(releasesDir, { recursive: true });
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  try {
    for (const value of manifest.files) {
      const relative = safeRelativePath(value);
      const buffer = relative === "manifest.json" ? manifestBuffer : await fetchBuffer(`${rawRoot}/${relative}`);
      const target = path.join(stagingDir, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer);
      if (relative.endsWith(".mjs")) validateModule(target);
    }

    const packageJson = JSON.parse((await readFile(path.join(stagingDir, "package.json"), "utf8")).replace(/^\uFEFF/, ""));
    if (String(packageJson?.version || "") !== remoteVersion) throw new Error("package version does not match update manifest");
    if (!validateInstalledRelease(stagingDir, remoteVersion)) throw new Error("staged release is incomplete");

    await rm(finalDir, { recursive: true, force: true });
    await rename(stagingDir, finalDir);
    return finalDir;
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function update() {
  const manifestBuffer = await fetchBuffer(manifestUrl);
  const manifest = JSON.parse(manifestBuffer.toString("utf8").replace(/^\uFEFF/, ""));
  const remoteVersion = String(manifest?.version || "").trim();
  const files = Array.isArray(manifest?.files) ? manifest.files.map(safeRelativePath) : [];
  if (!versionParts(remoteVersion) || files.length === 0 || files.length > 40) {
    throw new Error("invalid Print Agent update manifest");
  }
  manifest.files = files;

  const rejected = readRejectedRelease();
  const explicitRetry = process.env.PEDEAQUI_RETRY_REJECTED_RELEASE === "1";
  if (rejected?.version === remoteVersion && !explicitRetry) {
    console.warn(`PedeAqui Print Agent update ${remoteVersion} is quarantined after rollback; automatic retry skipped.`);
    return false;
  }
  if (rejected?.version === remoteVersion && explicitRetry) {
    console.warn(`PedeAqui Print Agent explicitly retrying quarantined release ${remoteVersion}.`);
  }

  const currentVersion = await localVersion();
  if (!isNewerVersion(remoteVersion, currentVersion)) return false;

  const finalDir = await stageRelease(manifest, manifestBuffer);
  const current = readReleaseState();
  activateRelease({ version: remoteVersion, releasePath: finalDir, previous: current });
  console.log(`PedeAqui Print Agent staged ${currentVersion || "unknown"} -> ${remoteVersion}; health confirmation pending.`);
  return true;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await update();
  } catch (error) {
    console.error("Print Agent automatic update skipped; current release remains active.", error);
  }
}

export { isNewerVersion, safeRelativePath };
