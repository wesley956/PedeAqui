// Local Windows pilot: fixed read-only probes, fake credentials and loopback
// HTTP/TCP only for delivery/printing. No installed production agent is touched.
import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { createServer as tcpServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createAgentApiClient } from "../src/api-client.mjs";
import { createDiagnosticController } from "../src/diagnostics.mjs";
import { collectDiagnostic, runWindowsCheck } from "../src/diagnostic-collector.mjs";
import { updateAgent } from "../src/updater-core.mjs";

const releaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = process.env.PEDEAQUI_PILOT_OUTPUT || path.resolve("Relatorio-Piloto-PedeAqui.json");
const scratch = await mkdtemp(path.join(tmpdir(), "pedeaqui-pilot-"));
const startedAt = new Date().toISOString();
const results = [];
let localReport = null;
let child = null;
let api, printer;
const sockets = new Set();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms = 20000) {
  const deadline = Date.now() + ms;
  while (!(await check())) { if (Date.now() > deadline) throw new Error("pilot_timeout"); await wait(50); }
}
const token = "isolated-local-pilot-only-credential";
try {
  console.log("[1/4] Conferindo os arquivos do piloto...");
  const manifest = JSON.parse(await readFile(path.join(releaseRoot, "manifest.json"), "utf8"));
  for (const file of manifest.files.filter(file => file !== "manifest.json")) {
    assert.equal(createHash("sha256").update(await readFile(path.join(releaseRoot, file))).digest("hex"), manifest.sha256[file]);
  }
  results.push({ test: "release_integrity", passed: true });

  console.log("[2/4] Testando atualizacao e recuperacao em uma pasta temporaria...");
  const updateRoot = path.join(scratch, "update-fixture");
  await cp(releaseRoot, updateRoot, { recursive: true });
  await writeFile(path.join(updateRoot, "package.json"), '{"version":"0.7.3","type":"module"}');
  const oldPackage = await readFile(path.join(updateRoot, "package.json"), "utf8");
  const fetchRelease = async url => {
    const file = new URL(url).pathname.split("/print-agent/")[1];
    if (!manifest.files.includes(file)) return new Response("", { status: 404 });
    return new Response(await readFile(path.join(releaseRoot, file)));
  };
  let failureObserved = false;
  try {
    await updateAgent({ rootDir: updateRoot, fetcher: fetchRelease, beforeActivate: file => { if (file === "package.json") throw new Error("simulated_activation_failure"); }, log: () => {} });
  } catch { failureObserved = true; }
  assert.ok(failureObserved);
  assert.equal(await readFile(path.join(updateRoot, "package.json"), "utf8"), oldPackage);
  assert.equal((await updateAgent({ rootDir: updateRoot, fetcher: fetchRelease, log: () => {} })).status, "updated");
  results.push({ test: "update_rollback_and_retry", passed: true });

  console.log("[3/4] Conferindo Windows, Epson e rede (somente leitura)...");
  const uploaded = [];
  const receipts = [];
  let uploadCount = 0, claimSent = false, ackCount = 0, ackAccepted = 0;
  let printerConfig;
  const jobId = "76000000-0000-4000-8000-000000000011";
  api = httpServer(async (request, response) => {
    const send = (body, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
    if (request.headers.authorization !== `Bearer ${token}`) return send({}, 401);
    let raw = "";
    for await (const chunk of request) { raw += chunk; if (raw.length > 32768) { request.destroy(); return; } }
    if (request.url === "/api/print-agent/diagnostics/result") {
      uploadCount++; uploaded.push(JSON.parse(raw));
      if (uploadCount === 1) { request.socket.destroy(); return; }
      return send({ status: "completed" });
    }
    if (request.url === "/api/print-agent/config") return send({ printers: printerConfig ? [printerConfig] : [] });
    if (request.url === "/api/print-agent/heartbeat") return send({ ok: true });
    if (request.url === "/api/print-agent/order-alerts") return send({ nativeEnabled: false, orders: [] });
    if (request.url === "/api/print-agent/claim") {
      if (!printerConfig || claimSent) return send({ jobs: [] });
      claimSent = true;
      return send({ jobs: [{ id: jobId, copies: 2, renderedContent: "PEDEAQUI PILOTO - SOMENTE RECEPTOR SIMULADO\n", textSize: "normal", lineSpacing: "normal", printer: printerConfig }] });
    }
    if (request.url === "/api/print-agent/ack") {
      ackCount++;
      if (ackCount === 1) { request.socket.destroy(); return; }
      ackAccepted++; return send({ ok: true });
    }
    return send({ error: "unsupported_fixture_request" }, 404);
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  const apiUrl = `http://127.0.0.1:${api.address().port}`;
  const post = createAgentApiClient({ apiUrl, token, timeoutMs: 8000 });
  let collectionCount = 0;
  const collect = async () => {
    collectionCount++;
    localReport = await collectDiagnostic({
      apiUrl: "https://www.pedeaqui.pp.ua", post: async () => ({ printers: [] }), version: manifest.version, directory: scratch,
      windowsCheck: async script => { console.log("  Conferindo uma etapa do Windows..."); return runWindowsCheck(script); },
    });
    // There is deliberately no production credential in this pilot.
    localReport.checks = localReport.checks.filter(check => check.name !== "authentication");
    return localReport;
  };
  const options = { apiUrl, token, post, version: manifest.version, directory: path.join(scratch, "diagnostics"), collect, log: () => {} };
  const controller = createDiagnosticController(options);
  for (let i = 0; i < 5; i++) await controller.handle(null);
  assert.equal(uploadCount, 0); assert.equal(collectionCount, 0);
  const command = { id: "76000000-0000-4000-8000-000000000020", expiresAt: new Date(Date.now() + 3600000).toISOString() };
  await controller.handle(command);
  assert.equal(collectionCount, 1); assert.equal(uploadCount, 1);
  // Emulate process restart after a lost server response.
  const restarted = createDiagnosticController(options);
  await restarted.handle(command); await restarted.handle(command);
  assert.equal(collectionCount, 1); assert.equal(uploadCount, 2);
  assert.deepEqual(uploaded[0], uploaded[1]);
  results.push({ test: "idle_does_not_collect", passed: true }, { test: "report_response_loss_and_restart", passed: true, collections: collectionCount, uploadAttempts: uploadCount });

  console.log("[4/4] Testando o agente real com uma impressora simulada local...");
  printer = tcpServer(socket => {
    sockets.add(socket); const chunks = [];
    socket.on("data", chunk => chunks.push(chunk));
    socket.on("end", () => { const bytes = Buffer.concat(chunks); if (bytes.length) receipts.push(bytes); });
    socket.on("close", () => sockets.delete(socket));
  });
  printer.listen(0, "127.0.0.1"); await once(printer, "listening");
  printerConfig = { id: "76000000-0000-4000-8000-000000000010", name: "Isolated loopback fixture", connectionType: "network", address: "127.0.0.1", port: printer.address().port, paperWidthMm: 80 };
  const workerRoot = path.join(scratch, "worker");
  await cp(path.join(releaseRoot, "src"), path.join(workerRoot, "src"), { recursive: true });
  const launch = () => {
    // Do not inherit production agent variables, credentials or paths.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/TOKEN|SECRET|PASSWORD|KEY|PEDEAQUI_/i.test(key)));
    child = spawn(process.execPath, [path.join(workerRoot, "src/index.mjs")], { cwd: workerRoot, windowsHide: true, stdio: "ignore", env: {
      ...env, PEDEAQUI_URL: apiUrl, PEDEAQUI_PRINT_AGENT_TOKEN: token, PEDEAQUI_PRINT_SPOOL: path.join(workerRoot, "spool"),
      PEDEAQUI_PRINT_POLL_MS: "1000", PEDEAQUI_NATIVE_ORDER_ALERTS: "0", PEDEAQUI_AGENT_WATCHDOG: "0",
    } });
  };
  const stop = async () => { const current = child; child = null; if (current && current.exitCode === null) { const ended = once(current, "exit"); current.kill(); await ended; } };
  launch(); await until(() => ackAccepted === 1 && receipts.length === 2); await stop();
  launch(); await wait(1500); await stop();
  assert.equal(receipts.length, 2); assert.equal(ackCount, 2);
  results.push({ test: "real_agent_two_simulated_copies", passed: true, receivedCopies: receipts.length }, { test: "real_agent_ack_loss_and_restart_no_duplicate", passed: true });
} catch {
  results.push({ test: "pilot_execution", passed: false, code: "pilot_step_failed" });
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) { const ended = once(child, "exit"); child.kill(); await ended.catch(() => {}); }
  for (const socket of sockets) socket.destroy();
  if (printer) await new Promise(resolve => printer.close(resolve));
  if (api) { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
  await mkdir(path.dirname(output), { recursive: true });
  const summary = { scope: "isolated_local_pilot", startedAt, finishedAt: new Date().toISOString(), platform: process.platform, productionAuthenticationTested: false, physicalPrintingTested: false, results, diagnostic: localReport };
  await writeFile(output, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
  console.log(results.every(result => result.passed) ? "PILOTO CONCLUIDO. Relatorio salvo." : "PILOTO INCOMPLETO. O relatorio indica as etapas concluidas.");
}
