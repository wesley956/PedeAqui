import { printNetwork } from "./escpos.mjs";
import { listSpool, removeSpool, saveSpool } from "./spool.mjs";

const apiUrl = (process.env.PEDEAQUI_URL || "").replace(/\/$/, "");
const token = process.env.PEDEAQUI_PRINT_AGENT_TOKEN || "";
const pollMs = Math.max(1000, Number(process.env.PEDEAQUI_PRINT_POLL_MS || 2000));
const heartbeatMs = Math.max(5000, Number(process.env.PEDEAQUI_PRINT_HEARTBEAT_MS || 15000));
const version = "0.1.0";
const printers = new Map();

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

async function deliver(job) {
  await saveSpool(job, "claimed");
  const printer = job.printer;
  printers.set(printer.id, { id: printer.id, status: "online", error: null });
  try {
    await saveSpool(job, "printing");
    if (printer.connectionType !== "network") throw new Error(`connection type ${printer.connectionType} is not implemented by agent MVP`);
    await printNetwork({ address: printer.address, port: printer.port }, job.renderedContent, job.copies);
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

async function heartbeat() {
  try {
    await post("/api/print-agent/heartbeat", {
      version,
      capabilities: { networkEscPos: true, spool: true, paperWidthsMm: [58, 80] },
      printers: [...printers.values()],
    });
  } catch (error) { console.error("heartbeat failed", error); }
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
