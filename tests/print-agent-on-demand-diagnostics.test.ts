import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { diagnosticReportSchema } from "@/features/printing/diagnostic-contract";

// @ts-expect-error Native agent modules intentionally run without TypeScript.
import { createDiagnosticController } from "../print-agent/src/diagnostics.mjs";
// @ts-expect-error Native agent modules intentionally run without TypeScript.
import { collectDiagnostic, runWindowsCheck } from "../print-agent/src/diagnostic-collector.mjs";

const command = { id: "00000000-0000-4000-8000-000000000001", expiresAt: "2026-11-05T00:00:00.000Z" };
const report = { schemaVersion: 1, agentVersion: "0.8.0", platform: "win32", startedAt: "2026-10-29T00:00:00.000Z", finishedAt: "2026-10-29T00:00:01.000Z", checks: [{ name: "runtime", status: "ok", code: "checked", values: {} }] };
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "pedeaqui-on-demand-")); directories.push(directory);
  let clock = Date.parse("2026-10-29T00:00:00.000Z");
  const collect = vi.fn().mockResolvedValue(report);
  const post = vi.fn().mockResolvedValue({ status: "completed" });
  const options = { apiUrl: "https://example.test", token: "fixture-token", version: "0.8.0", directory, collect, post, now: () => clock, log: vi.fn() };
  return { directory, collect, post, options, advance: (ms: number) => { clock += ms; }, controller: createDiagnosticController(options) };
}

describe("on-demand agent diagnostic delivery", () => {
  it("does no I/O, probing or requests without an explicit valid command", async () => {
    const test = await fixture();
    await test.controller.handle(null);
    await test.controller.handle({ ...command, id: "../../run.cmd" });
    await test.controller.handle({ ...command, expiresAt: "2020-01-01T00:00:00Z" });
    expect(test.collect).not.toHaveBeenCalled(); expect(test.post).not.toHaveBeenCalled();
    expect(await readdir(test.directory)).toEqual([]);
  });
  it("collects once, sends once and ignores the same command after a restart", async () => {
    const test = await fixture();
    await test.controller.handle(command); await test.controller.handle(command);
    await createDiagnosticController(test.options).handle(command);
    expect(test.collect).toHaveBeenCalledTimes(1); expect(test.post).toHaveBeenCalledTimes(1);
    expect(test.post).toHaveBeenCalledWith("/api/print-agent/diagnostics/result", { requestId: command.id, report });
    expect(JSON.stringify(await Promise.all((await readdir(test.directory)).map(name => readdir(path.join(test.directory, name)))))).not.toContain("fixture-token");
  });
  it("retries a lost confirmation with the saved report, backoff and no recollection", async () => {
    const test = await fixture(); test.post.mockRejectedValueOnce(new Error("lost response"));
    await test.controller.handle(command);
    await test.controller.handle(command); expect(test.post).toHaveBeenCalledTimes(1);
    test.advance(60000); await test.controller.handle(command);
    expect(test.post).toHaveBeenCalledTimes(2); expect(test.collect).toHaveBeenCalledTimes(1);
    expect(test.post.mock.calls[0]![1]).toEqual(test.post.mock.calls[1]![1]);
  });
  it("restores an offline report after process restart", async () => {
    const test = await fixture(); test.post.mockRejectedValueOnce(new Error("offline"));
    await test.controller.handle(command);
    await createDiagnosticController(test.options).handle(command);
    expect(test.collect).toHaveBeenCalledTimes(1); expect(test.post).toHaveBeenCalledTimes(2);
  });
  it("reports interrupted collection instead of starting it again", async () => {
    const test = await fixture(); await test.controller.handle(command);
    const [scope] = await readdir(test.directory);
    await writeFile(path.join(test.directory, scope!, `${command.id}.json`), JSON.stringify({ status: "collecting", startedAt: report.startedAt }));
    await createDiagnosticController(test.options).handle(command);
    expect(test.collect).toHaveBeenCalledTimes(1);
    expect(test.post.mock.lastCall?.[1].report.checks[0].code).toBe("interrupted");
  });
  it("prevents concurrent instances from collecting a second copy", async () => {
    const test = await fixture(); let release!: (value: unknown) => void;
    test.collect.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = test.controller.handle(command);
    await vi.waitFor(() => expect(test.collect).toHaveBeenCalledTimes(1));
    await createDiagnosticController(test.options).handle(command);
    expect(test.collect).toHaveBeenCalledTimes(1);
    release(report); await first;
  });
  it("stops retrying after the request expires", async () => {
    const test = await fixture(); test.post.mockRejectedValue(new Error("offline"));
    await test.controller.handle(command); test.advance(8 * 86400000);
    await test.controller.handle(null);
    expect(test.post).toHaveBeenCalledTimes(1);
  });
  it("does not upload a corrupt local report or re-run its probes", async () => {
    const test = await fixture(); await test.controller.handle(command);
    const [scope] = await readdir(test.directory);
    await writeFile(path.join(test.directory, scope!, `${command.id}.json`), "corrupt");
    await createDiagnosticController(test.options).handle(command);
    expect(test.collect).toHaveBeenCalledTimes(1); expect(test.post).toHaveBeenCalledTimes(1);
  });
});

describe("bounded read-only collector", () => {
  it("continues after a Windows probe fails and strips unapproved output", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "pedeaqui-collector-")); directories.push(directory);
    const windowsCheck = vi.fn().mockResolvedValue({ status: "ok", code: "checked", values: { serviceRunning: true, token: "secret", CommandLine: "private", printerCount: 1 } }).mockRejectedValueOnce(new Error("private error"));
    const result = await collectDiagnostic({ apiUrl: "https://example.test", version: "0.8.0", directory, platform: "win32", windowsCheck,
      post: vi.fn().mockResolvedValue({ printers: [{ name: "private" }] }), fetcher: vi.fn().mockResolvedValue(new Response("{}")) });
    expect(result.checks).toHaveLength(10); expect(windowsCheck).toHaveBeenCalledTimes(5);
    expect(result.checks.find((check: { name: string }) => check.name === "startup").status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toMatch(/secret|private|CommandLine/);
    expect(diagnosticReportSchema.safeParse(result).success).toBe(true);
  });
  it("times out a stuck PowerShell child and ignores its stderr", async () => {
    const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), kill: vi.fn() });
    const spawnProcess = vi.fn().mockReturnValue(child);
    const result = await runWindowsCheck("fixed script", { spawnProcess, timeoutMs: 15 });
    expect(result.status).toBe("timeout"); expect(child.kill).toHaveBeenCalled();
    expect(spawnProcess.mock.calls[0]![1]).toContain("-NonInteractive");
    const env = spawnProcess.mock.calls[0]![2].env;
    expect(Object.keys(env).some(key => /TOKEN|SECRET|PASSWORD|KEY/i.test(key))).toBe(false);
  });
  it("rejects arbitrary report fields and duplicated check names", () => {
    const result = diagnosticReportSchema.parse({ ...report, token: "secret", checks: [{ ...report.checks[0], values: { token: "secret", writable: true } }] });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(diagnosticReportSchema.safeParse({ ...report, checks: [report.checks[0], report.checks[0]] }).success).toBe(false);
  });
  it("persists only approved report content after success", async () => {
    const test = await fixture(); await test.controller.handle(command);
    const [scope] = await readdir(test.directory);
    expect(await readFile(path.join(test.directory, scope!, `${command.id}.json`), "utf8")).toBe('{"status":"sent"}');
  });
});

describe.skipIf(process.platform !== "win32")("native Windows on-demand diagnostic", () => {
  it("executes the noninteractive PowerShell transport with fixture values", async () => {
    const result = await runWindowsCheck("@{serviceRunning=$true;printerCount=2}");
    expect(result).toEqual({ status: "ok", code: "checked", values: { serviceRunning: true, printerCount: 2 } });
  });
  it("reports access denied without sending raw exception text", async () => {
    const result = await runWindowsCheck("throw [UnauthorizedAccessException]::new('private fixture path')");
    expect(result.code).toBe("access_denied"); expect(JSON.stringify(result)).not.toContain("private");
  });
  it("parses every fixed Windows script without executing real machine queries", async () => {
    // @ts-expect-error Native agent runtime.
    const { windowsChecks } = await import("../print-agent/src/diagnostic-collector.mjs");
    for (const script of Object.values(windowsChecks)) {
      const literal = Buffer.from(String(script), "utf16le").toString("base64");
      const result = await runWindowsCheck(`[void][scriptblock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${literal}'))); @{writable=$true}`);
      expect(result.status).toBe("ok");
    }
  }, 30000);
});
