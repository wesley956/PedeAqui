import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { windowsPrintingDiagnostic } from "@/features/printing/windows-diagnostic";

const cmd = windowsPrintingDiagnostic("https://www.pedeaqui.pp.ua/settings");
const encoded = cmd.split("\r\n:PEDEAQUI_DIAGNOSTIC_BASE64\r\n")[1]!.trim();
const script = Buffer.from(encoded, "base64").toString("utf16le");

describe("Windows support diagnostic (#1291)", () => {
  it("ships a self-contained PowerShell 5.1 command without a supplied credential", () => {
    expect(script).toContain("$base = 'https://www.pedeaqui.pp.ua'");
    expect(script).toContain("Get-ScheduledTaskInfo");
    expect(script).toContain("Get-CimInstance Win32_Printer");
    expect(script).toContain("batteryStartBlocked");
    expect(script).toContain("/api/print-agent/config");
    expect(script).toContain("$report.expectedServer = $allowed -contains $configured");
    expect(Math.max(...cmd.split(/\r?\n/).map((line) => line.length))).toBeLessThan(1000);
  });
  it("does not change processes, tasks, spool, credentials or orders", () => {
    for (const forbidden of ["Stop-Process", "Start-Process", "Set-ScheduledTask", "Register-ScheduledTask", "Remove-Item", "Set-Content", "/claim", "/ack", "/fail", "/heartbeat", "service_role", "Write-Output $runner", "Write-Output $token"]) expect(script).not.toContain(forbidden);
    expect(script).toContain("Write-Output ($report | ConvertTo-Json");
  });
  it("rejects non-HTTP origins", () => {
    expect(() => windowsPrintingDiagnostic("javascript:alert(1)")).toThrow("invalid_app_origin");
  });
});

describe.skipIf(process.platform !== "win32")("Windows diagnostic execution in an isolated fixture", () => {
  it("parses and executes without touching production, and omits process command lines", () => {
    const prefix = `
function Get-ScheduledTask { throw 'fixture task absent' }
function Get-ScheduledTaskInfo { throw 'fixture task absent' }
function Get-CimInstance { return @() }
function Get-Service { return @{ Status = 'Running' } }
function Test-Path { return $false }
function Invoke-WebRequest { return @{ StatusCode = 200 } }
function Read-Host { return '' }
`;
    const directory = mkdtempSync(path.join(tmpdir(), "pedeaqui diagnostic "));
    try {
      const file = path.join(directory, "diagnose.cmd");
      const fixture = cmd.replace(encoded, Buffer.from(prefix + script, "utf16le").toString("base64")).replace("if errorlevel 1 pause", "if errorlevel 1 exit /b 1");
      writeFileSync(file, fixture);
      const result = spawnSync("cmd.exe", ["/d", "/c", file], { encoding: "utf8", timeout: 30_000 });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toMatch(/"siteHttp"\s*:\s*200/);
      expect(result.stdout).not.toContain("Authorization");
      expect(result.stdout).not.toContain("CommandLine");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
