import { printNetwork, probeNetwork } from "./escpos.mjs";
import { listSystemPrinters, printSystem, probeSystem } from "./system-print.mjs";
import { listSpool, removeSpool, saveSpool } from "./spool.mjs";

const apiUrl = (process.env.PEDEAQUI_URL || "").replace(/\/$/, "");
const token = process.env.PEDEAQUI_PRINT_AGENT_TOKEN || "";
const pollMs = Math.max(1000, Number(process.env.PEDEAQUI_PRINT_POLL_MS || 2000));
const heartbeatMs = Math.max(5000, Number(process.env.PEDEAQUI_PRINT_HEARTBEAT_MS || 15000));
const version = "0.3.0";
const printers = new Map();
let heartbeatRunning = false;
let lastDiscoveryAt = 0;
let discoveredPrinters = [];

if (!apiUrl || !token) {
  console.error("PEDEAQUI_URL and PEDEAQUI_PRINT_AGENT_TOKEN are required");
  process.exit(1);
}

async function post(path, body = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${data?.error || "request failed"}`);
  return data;
}

async function acknowledge(jobId) { await post("/api/print-agent/ack", { jobId }); }
async function fail(jobId, error) { await post("/api/print-agent/fail", { jobId, error: String(error).slice(0, 2000) }); }

async function recoverSpool() {
  for (const entry of await listSpool()) {
    const job = entry?.job;
    if (!job?.id) continue;
    try {
      if (entry.state === "printed_unacked") await acknowledge(job.id);
      else await fail(job.id, "Print Agent restarted during physical delivery; state uncertain");
      await removeSpool(job.id);
    } catch (error) {
      console.error("spool recovery failed", job.id, error);
    }
  }
}

async function sendToPrinter(printer, content, copies) {
  if (printer.connectionType === "network") {
    await printNetwork({ address: printer.address, port: printer.port }, content, copies);
    return;
  }
  if (printer.connectionType === "system" || printer.connectionType === "usb") {
    await printSystem({ address: printer.address }, content, copies);
    return;
  }
  throw new Error(`connection type ${printer.connectionType} is not implemented by this agent`);
}

async function deliver(job) {
  await saveSpool(job, "claimed");
  const printer = job.printer;
  printers.set(printer.id, { id: printer.id, status: "online", error: null });
  try {
    await saveSpool(job, "printing");
    await sendToPrinter(printer, job.renderedContent, job.copies);
    await saveSpool(job, "printed_unacked");
    await acknowledge(job.id);
    await removeSpool(job.id);
    printers.set(printer.id, { id: printer.id, status: "online", error: null });
    console.log(`printed ${job.id} on ${printer.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    printers.set(printer.id, { id: printer.id, status: "degraded", error: message.slice(0, 2000) });
    try { await fail(job.id, message); await removeSpool(job.id); }
    catch (reportError) { console.error("failed to report print failure", job.id, reportError); }
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
  await Promise.all(configured.map(async (printer) => {
    if (!["network", "system", "usb"].includes(printer.connectionType)) {
      printers.set(printer.id, { id: printer.id, status: "unknown", error: null });
      return;
    }
    try {
      await probePrinter(printer);
      printers.set(printer.id, { id: printer.id, status: "online", error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      printers.set(printer.id, { id: printer.id, status: "offline", error: message.slice(0, 2000) });
    }
  }));
  for (const id of printers.keys()) {
    if (!configuredIds.has(id)) printers.delete(id);
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
        healthProbe: true,
        paperWidthsMm: [58, 80],
      },
      printers: [...printers.values()],
    });
  } catch (error) {
    console.error("heartbeat failed", error);
  } finally {
    heartbeatRunning = false;
  }
}

async function loop() {
  await recoverSpool();
  void heartbeat();
  setInterval(() => void heartbeat(), heartbeatMs).unref();
  for (;;) {
    try {
      const { jobs = [] } = await post("/api/print-agent/claim", { limit: 5 });
      for (const job of jobs) await deliver(job);
    } catch (error) { console.error("claim failed", error); }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

process.on("unhandledRejection", (error) => console.error("unhandled rejection", error));
void loop();
