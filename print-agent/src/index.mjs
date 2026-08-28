import { printNetwork, probeNetwork } from "./escpos.mjs";
import { listSystemPrinters, printSystem, probeSystem } from "./system-print.mjs";
import { listSpool, removeSpool, saveSpool } from "./spool.mjs";

const apiUrl = (process.env.PEDEAQUI_URL || "").replace(/\/$/, "");
const token = process.env.PEDEAQUI_PRINT_AGENT_TOKEN || "";
const pollMs = Math.max(1000, Number(process.env.PEDEAQUI_PRINT_POLL_MS || 2000));
const heartbeatMs = Math.max(5000, Number(process.env.PEDEAQUI_PRINT_HEARTBEAT_MS || 15000));
const requestTimeoutMs = Math.max(3000, Number(process.env.PEDEAQUI_PRINT_REQUEST_TIMEOUT_MS || 8000));
const updateCheckMs = Math.max(60000, Number(process.env.PEDEAQUI_PRINT_UPDATE_CHECK_MS || 6 * 60 * 60 * 1000));
const watchdogEnabled = process.env.PEDEAQUI_AGENT_WATCHDOG === "1";
const remoteManifestUrl = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent/manifest.json";
const version = "0.4.1";
const printers = new Map();
const deliveryFailures = new Map();
const deliveryFailureHoldMs = 5 * 60 * 1000;
let heartbeatRunning = false;
let updateCheckRunning = false;
let updateRequested = false;
let lastUpdateCheckAt = 0;
let lastDiscoveryAt = 0;
let discoveredPrinters = [];
let inMemoryPrintedUnacked = null;

if (!apiUrl || !token) {
  console.error("PEDEAQUI_URL and PEDEAQUI_PRINT_AGENT_TOKEN are required");
  process.exit(1);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

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

function errorMessage(error) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

async function post(path, body = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data?.error || "request failed"}`);
  return data;
}

async function acknowledge(jobId) { await post("/api/print-agent/ack", { jobId }); }
async function fail(jobId, error) { await post("/api/print-agent/fail", { jobId, error: String(error).slice(0, 2000) }); }

async function recoverPrintedUnacked(job) {
  try {
    await acknowledge(job.id);
    await removeSpool(job.id).catch((error) => console.error("spool cleanup after ACK failed", job.id, error));
    inMemoryPrintedUnacked = null;
    if (job.printer?.id) {
      deliveryFailures.delete(job.printer.id);
      printers.set(job.printer.id, { id: job.printer.id, status: "online", error: null });
    }
    console.log(`recovered ACK ${job.id}`);
    return true;
  } catch (error) {
    console.error("printed job ACK recovery pending", job.id, error);
    return false;
  }
}

async function recoverSpool() {
  if (inMemoryPrintedUnacked && !(await recoverPrintedUnacked(inMemoryPrintedUnacked))) return false;

  let entries;
  try {
    entries = await listSpool();
  } catch (error) {
    console.error("spool scan failed", error);
    return false;
  }

  let ready = true;
  for (const entry of entries) {
    const job = entry?.job;
    if (!job?.id) continue;
    try {
      if (entry.state === "printed_unacked") {
        await acknowledge(job.id);
      } else if (entry.state === "failed_unreported") {
        await fail(job.id, entry.failureError || "Print Agent failed before physical delivery");
      } else {
        await fail(job.id, "Print Agent restarted during physical delivery; state uncertain");
      }
      await removeSpool(job.id);
    } catch (error) {
      ready = false;
      console.error("spool recovery pending", job.id, error);
    }
  }
  return ready;
}

async function sendToPrinter(printer, content, copies, jobId) {
  if (printer.connectionType === "network") {
    await printNetwork({ address: printer.address, port: printer.port }, content, copies);
    return;
  }
  if (printer.connectionType === "system" || printer.connectionType === "usb") {
    await printSystem({ address: printer.address }, content, copies, jobId);
    return;
  }
  throw new Error(`connection type ${printer.connectionType} is not implemented by this agent`);
}

function markDeliveryFailure(printer, message) {
  if (!printer?.id) return;
  deliveryFailures.set(printer.id, { at: Date.now(), error: message });
  printers.set(printer.id, { id: printer.id, status: "degraded", error: message });
}

async function reportPrePrintFailure(job, printer, error) {
  const message = errorMessage(error);
  markDeliveryFailure(printer, message);
  try {
    await fail(job.id, message);
    await removeSpool(job.id).catch((cleanupError) => console.error("failed spool cleanup", job.id, cleanupError));
  } catch (reportError) {
    console.error("failed to report print failure", job.id, reportError);
    await saveSpool(job, "failed_unreported", { failureError: message }).catch((spoolError) => {
      console.error("failed to persist unreported print failure", job.id, spoolError);
    });
  }
}

async function deliver(job) {
  const printer = job.printer;
  printers.set(printer.id, { id: printer.id, status: "online", error: null });

  try {
    await saveSpool(job, "claimed");
    await saveSpool(job, "printing");
    await sendToPrinter(printer, job.renderedContent, job.copies, job.id);
  } catch (error) {
    await reportPrePrintFailure(job, printer, error);
    return;
  }

  try {
    await saveSpool(job, "printed_unacked");
  } catch (error) {
    console.error("printed job could not persist ACK state; keeping it blocked in memory", job.id, error);
  }
  inMemoryPrintedUnacked = job;

  try {
    await acknowledge(job.id);
    await removeSpool(job.id).catch((error) => console.error("spool cleanup after print failed", job.id, error));
    inMemoryPrintedUnacked = null;
    deliveryFailures.delete(printer.id);
    printers.set(printer.id, { id: printer.id, status: "online", error: null });
    console.log(`printed ${job.id} on ${printer.name}`);
  } catch (error) {
    const message = `Impressão física enviada, mas a confirmação ao PedeAqui ficou pendente: ${errorMessage(error)}`.slice(0, 2000);
    markDeliveryFailure(printer, message);
    console.error("ACK pending after physical print", job.id, error);
    await saveSpool(job, "printed_unacked", { ackError: message }).catch((spoolError) => {
      console.error("failed to persist pending ACK", job.id, spoolError);
    });
  }
}

async function probePrinter(printer) {
  if (printer.connectionType === "network") {
    await probeNetwork({ address: printer.address, port: printer.port });
    return;
  }
  if (printer.connectionType === "system" || printer.connectionType === "usb") {
    await probeSystem({ address: printer.address });
    return;
  }
  throw new Error(`health check unavailable for ${printer.connectionType}`);
}

async function refreshPrinterHealth() {
  const { printers: configured = [] } = await post("/api/print-agent/config");
  const configuredIds = new Set(configured.map((printer) => printer.id));
  const now = Date.now();
  await Promise.all(configured.map(async (printer) => {
    if (!["network", "system", "usb"].includes(printer.connectionType)) {
      printers.set(printer.id, { id: printer.id, status: "unknown", error: null });
      return;
    }
    try {
      await probePrinter(printer);
      const failure = deliveryFailures.get(printer.id);
      if (failure && now - failure.at < deliveryFailureHoldMs) {
        printers.set(printer.id, { id: printer.id, status: "degraded", error: failure.error });
      } else {
        if (failure) deliveryFailures.delete(printer.id);
        printers.set(printer.id, { id: printer.id, status: "online", error: null });
      }
    } catch (error) {
      const message = errorMessage(error);
      printers.set(printer.id, { id: printer.id, status: "offline", error: message });
    }
  }));
  for (const id of printers.keys()) {
    if (!configuredIds.has(id)) {
      printers.delete(id);
      deliveryFailures.delete(id);
    }
  }
}

async function refreshDiscovery() {
  if (process.platform !== "win32") {
    discoveredPrinters = [];
    return;
  }
  const now = Date.now();
  if (now - lastDiscoveryAt < 60000) return;
  lastDiscoveryAt = now;
  try {
    discoveredPrinters = await listSystemPrinters();
  } catch (error) {
    console.error("printer discovery failed", error);
  }
}

async function checkForUpdate(force = false) {
  if (!watchdogEnabled || updateCheckRunning || updateRequested) return;
  const now = Date.now();
  if (!force && now - lastUpdateCheckAt < updateCheckMs) return;
  lastUpdateCheckAt = now;
  updateCheckRunning = true;
  try {
    const response = await fetch(`${remoteManifestUrl}?t=${now}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    const manifest = await response.json();
    const remoteVersion = String(manifest?.version || "");
    if (isNewerVersion(remoteVersion, version)) {
      updateRequested = true;
      console.log(`Print Agent update available: ${version} -> ${remoteVersion}`);
    }
  } catch (error) {
    console.error("update check failed", error);
  } finally {
    updateCheckRunning = false;
  }
}

async function heartbeat() {
  if (heartbeatRunning) return;
  heartbeatRunning = true;
  try {
    await Promise.all([refreshPrinterHealth(), refreshDiscovery()]);
    await post("/api/print-agent/heartbeat", {
      version,
      capabilities: {
        networkEscPos: true,
        windowsRawSpooler: process.platform === "win32",
        usbViaWindowsSpooler: process.platform === "win32",
        autoDiscovery: process.platform === "win32",
        discoveredPrinters,
        spool: true,
        stableSpoolPath: true,
        boundedApiRequests: true,
        ackRecovery: true,
        spoolRecoveryBlocking: true,
        healthProbe: true,
        autoRecovery: true,
        windowsSpoolerRecovery: process.platform === "win32",
        isolatedWindowsJobCleanup: process.platform === "win32",
        watchdog: watchdogEnabled,
        selfUpdate: watchdogEnabled,
        paperWidthsMm: [58, 80],
      },
      printers: [...printers.values()],
    });
    void checkForUpdate();
  } catch (error) {
    console.error("heartbeat failed", error);
  } finally {
    heartbeatRunning = false;
  }
}

async function loop() {
  void heartbeat();
  void checkForUpdate(true);
  setInterval(() => void heartbeat(), heartbeatMs).unref();

  for (;;) {
    const spoolReady = await recoverSpool().catch((error) => {
      console.error("spool recovery cycle failed", error);
      return false;
    });
    if (!spoolReady) {
      await sleep(pollMs);
      continue;
    }

    try {
      const { jobs = [] } = await post("/api/print-agent/claim", { limit: 5 });
      for (const job of jobs) {
        await deliver(job);
        if (inMemoryPrintedUnacked) break;
      }
    } catch (error) {
      console.error("claim failed", error);
    }

    if (updateRequested && watchdogEnabled && !inMemoryPrintedUnacked) {
      console.log("Restarting Print Agent so the watchdog can install the available update.");
      process.exit(75);
    }
    await sleep(pollMs);
  }
}

process.on("unhandledRejection", (error) => console.error("unhandled rejection", error));
void loop();
