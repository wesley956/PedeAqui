import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(rootDir, ".update");
const rawRoot = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent";
const manifestUrl = `${rawRoot}/manifest.json`;

function safeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`invalid update path: ${value}`);
  }
  return normalized;
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
    const parsed = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
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

async function update() {
  const manifestBuffer = await fetchBuffer(manifestUrl);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  const remoteVersion = String(manifest?.version || "").trim();
  const files = Array.isArray(manifest?.files) ? manifest.files.map(safeRelativePath) : [];
  if (!/^\d+\.\d+\.\d+$/.test(remoteVersion) || files.length === 0 || files.length > 30) {
    throw new Error("invalid Print Agent update manifest");
  }

  const currentVersion = await localVersion();
  if (currentVersion === remoteVersion) return;

  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  for (const relative of files) {
    const buffer = relative === "manifest.json" ? manifestBuffer : await fetchBuffer(`${rawRoot}/${relative}`);
    const target = path.join(tempDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    if (relative.endsWith(".mjs")) validateModule(target);
  }

  const ordered = [
    ...files.filter((file) => file !== "package.json"),
    ...files.filter((file) => file === "package.json"),
  ];
  for (const relative of ordered) {
    const source = path.join(tempDir, relative);
    const destination = path.join(rootDir, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  await rm(tempDir, { recursive: true, force: true });
  console.log(`PedeAqui Print Agent updated ${currentVersion || "unknown"} -> ${remoteVersion}`);
}

try {
  await update();
} catch (error) {
  console.error("Print Agent automatic update skipped; current version will continue running.", error);
}
