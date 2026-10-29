import { afterEach, describe, expect, it } from "vitest";
import { createServer as httpServer } from "node:http";
import { createServer as tcpServer, type Socket } from "node:net";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type Mode = "normal" | "drop_ack_once" | "reject_claim_once" | "hold_recovery";
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function until(check: () => boolean | Promise<boolean>, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("Isolated Print Agent condition timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function fixture(mode: Mode, copies = 2, queued = true) {
  const root = await mkdtemp(path.join(tmpdir(), "pedeaqui-print-recovery-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  await cp(path.resolve("print-agent/src"), path.join(root, "src"), { recursive: true });
  const spool = path.join(root, "spool");
  await mkdir(spool);
  const sockets = new Set<Socket>();
  const receipts: Buffer[] = [];
  const printerServer = tcpServer((socket) => {
    sockets.add(socket);
    const chunks: Buffer[] = [];
    socket.on("data", (data) => chunks.push(typeof data === "string" ? Buffer.from(data) : data));
    socket.on("end", () => { const data = Buffer.concat(chunks); if (data.length) receipts.push(data); });
    socket.on("close", () => sockets.delete(socket));
  });
  printerServer.listen(0, "127.0.0.1"); await once(printerServer, "listening");
  cleanup.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => printerServer.close(() => resolve())); });
  const address = printerServer.address();
  if (!address || typeof address === "string") throw new Error("No printer listener");
  const printer = { id: "76000000-0000-4000-8000-000000000010", name: "Isolated TCP receiver", connectionType: "network", address: "127.0.0.1", port: address.port, paperWidthMm: 80 };
  const job = { id: "76000000-0000-4000-8000-000000000011", printer, copies, renderedContent: "TEST ONLY — PEDEAQUI 1291\n", textSize: "normal", lineSpacing: "normal" };
  const state = { claimed: false, claimCalls: 0, ackAttempts: 0, ackAccepted: 0, failCalls: 0, recoveryAllowed: false, failures: [] as string[] };
  const api = httpServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer isolated-fixture-token") { response.writeHead(401); response.end("{}"); return; }
    let raw = ""; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw || "{}");
    const send = (value: unknown, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
    if (request.url === "/api/print-agent/config") return send({ printers: [printer] });
    if (request.url === "/api/print-agent/heartbeat") return send({ ok: true });
    if (request.url === "/api/print-agent/claim") {
      state.claimCalls++;
      if (mode === "reject_claim_once" && state.claimCalls === 1) return send({ error: "temporarily_unavailable" }, 503);
      const jobs = queued && !state.claimed ? [job] : [];
      if (jobs.length) state.claimed = true;
      return send({ jobs });
    }
    if (request.url === "/api/print-agent/ack") {
      state.ackAttempts++;
      if (mode === "drop_ack_once" && state.ackAttempts === 1) { request.socket.destroy(); return; }
      state.ackAccepted++; return send({ ok: true });
    }
    if (request.url === "/api/print-agent/fail") {
      state.failCalls++; state.failures.push(String(body.error));
      if (mode === "hold_recovery" && !state.recoveryAllowed) return send({ error: "temporarily_unavailable" }, 503);
      return send({ ok: true });
    }
    send({ error: "unexpected_endpoint" }, 404);
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  cleanup.push(async () => { api.closeAllConnections(); await new Promise<void>((resolve) => api.close(() => resolve())); });
  const apiAddress = api.address();
  if (!apiAddress || typeof apiAddress === "string") throw new Error("No API listener");
  let child: ChildProcess | null = null;
  let output = "";
  const stop = async () => {
    const current = child; child = null;
    if (!current || current.exitCode !== null || current.signalCode !== null) return;
    const closed = once(current, "exit"); current.kill("SIGTERM");
    await Promise.race([closed, new Promise<void>((resolve) => { const timer = setTimeout(() => { current.kill("SIGKILL"); resolve(); }, 2000); timer.unref(); })]);
  };
  cleanup.push(stop);
  const start = () => {
    const launched = spawn(process.execPath, [path.join(root, "src/index.mjs")], {
      cwd: root,
      // No production credentials, inherited app environment or external API URLs.
      env: { NODE_ENV: "test", PEDEAQUI_URL: `http://127.0.0.1:${apiAddress.port}`, PEDEAQUI_PRINT_AGENT_TOKEN: "isolated-fixture-token", PEDEAQUI_PRINT_SPOOL: spool, PEDEAQUI_PRINT_POLL_MS: "1000", PEDEAQUI_PRINT_HEARTBEAT_MS: "5000", PEDEAQUI_NATIVE_ORDER_ALERTS: "0", PEDEAQUI_AGENT_WATCHDOG: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = launched;
    launched.stdout?.on("data", (data) => { output += data; });
    launched.stderr?.on("data", (data) => { output += data; });
  };
  const entryPath = path.join(spool, `${job.id}.json`);
  const seed = async (status: string) => writeFile(entryPath, JSON.stringify({ job, state: status, failureError: "isolated failure" }));
  const emptySpool = async () => (await readdir(spool)).filter((name) => name.endsWith(".json")).length === 0;
  return { state, receipts, start, stop, seed, emptySpool, entryPath, output: () => output };
}

// These tests run the real Node agent with loopback HTTP/TCP only. They do not
// exercise Windows USB/spooler/boot, which require the physical acceptance gate.
describe.skipIf(process.platform === "win32")("actual Print Agent isolated recovery (#1291)", () => {
  it.each([1, 2])("delivers exactly %i configured copies on a successful attempt", async (copies) => {
    const test = await fixture("normal", copies); test.start();
    await until(async () => test.state.ackAccepted === 1 && await test.emptySpool());
    expect(test.receipts).toHaveLength(copies);
    expect(test.state.failCalls).toBe(0);
    expect(test.receipts.every((data) => data.includes(Buffer.from("TEST ONLY")))).toBe(true);
  }, 15_000);

  it("recovers an ACK response lost after TCP delivery without sending the copies again", async () => {
    const test = await fixture("drop_ack_once"); test.start();
    await until(async () => test.state.ackAccepted === 1 && await test.emptySpool());
    expect(test.state.ackAttempts).toBe(2);
    expect(test.receipts).toHaveLength(2);
  }, 15_000);

  it("recovers persisted printed_unacked after process restart without any physical resend", async () => {
    const test = await fixture("normal", 2, false);
    await test.seed("printed_unacked"); test.start();
    await until(async () => test.state.ackAccepted === 1 && await test.emptySpool());
    await test.stop(); test.start();
    await until(() => test.state.claimCalls >= 2);
    expect(test.state.ackAccepted).toBe(1);
    expect(test.receipts).toHaveLength(0);
  }, 15_000);

  it("survives an actual process interruption after delivery while its ACK is pending", async () => {
    const test = await fixture("drop_ack_once"); test.start();
    await until(async () => {
      if (test.state.ackAttempts !== 1) return false;
      try { return JSON.parse(await readFile(test.entryPath, "utf8")).state === "printed_unacked"; }
      catch { return false; }
    });
    await test.stop();
    expect(test.receipts).toHaveLength(2);
    test.start();
    await until(async () => test.state.ackAccepted === 1 && await test.emptySpool());
    expect(test.state.ackAttempts).toBe(2);
    expect(test.receipts).toHaveLength(2);
  }, 15_000);

  it("resumes polling after temporary API failure and keeps the configured two copies", async () => {
    const test = await fixture("reject_claim_once"); test.start();
    await until(async () => test.state.ackAccepted === 1 && await test.emptySpool());
    expect(test.state.claimCalls).toBeGreaterThanOrEqual(2);
    expect(test.receipts).toHaveLength(2);
  }, 15_000);

  it("blocks new claims until a persisted failure has been reported successfully", async () => {
    const test = await fixture("hold_recovery");
    await test.seed("failed_unreported"); test.start();
    await until(() => test.state.failCalls >= 1);
    expect(test.state.claimCalls).toBe(0);
    expect(JSON.parse(await readFile(test.entryPath, "utf8")).state).toBe("failed_unreported");
    test.state.recoveryAllowed = true;
    await until(async () => test.state.ackAccepted === 1 && await test.emptySpool());
    expect(test.state.failCalls).toBeGreaterThanOrEqual(2);
    expect(test.receipts).toHaveLength(2);
  }, 15_000);
});
