import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { assistedInstaller } from "@/features/printing/assisted-installer";

const installer = assistedInstaller("test-token", "https://example.test/");
const lines = installer.split(/\r?\n/);

describe("Print Agent installation", () => {
  it("downloads and installs every runtime file listed in the release manifest", () => {
    const manifest = JSON.parse(readFileSync("print-agent/manifest.json", "utf8"));
    for (const file of manifest.files as string[]) {
      const name = path.posix.basename(file);
      expect(installer).toContain(`/${name}' -OutFile`);
      expect(installer).toContain(`\\${name}" >nul || goto :permission_error`);
    }
    const downloads = lines.find(line => line.includes("Invoke-WebRequest"))!;
    expect(downloads).toContain("$ErrorActionPreference='Stop'");
  });

  it("stops the existing watchdog before replacing runtime files", () => {
    const stop = installer.indexOf("Stop-Process");
    expect(stop).toBeGreaterThan(0);
    expect(stop).toBeLessThan(installer.indexOf('copy /Y "%DL_DIR%'));
    expect(installer).toContain("$_.CommandLine.Contains($runner)");
    expect(installer).toContain("$_.CommandLine.Contains($index)");
    expect(installer).toContain("$_.CommandLine.Contains($updater)");
    expect(installer).toContain('StartUp\\PedeAqui-Impressao.vbs"');
  });

  it("protects the root and enables inheritance on children instead of stripping each file ACL", () => {
    const acl = lines.filter(line => line.startsWith("icacls"));
    const root = acl.find(line => line.includes("/inheritance:r"))!;
    expect(root).not.toContain("/T");
    expect(acl).toContain('icacls "%APP_DIR%\\*" /inheritance:e /T /C >nul 2>&1');
  });

  it("changes only the battery settings of the installed task", () => {
    const settings = lines.find(line => line.includes("Set-ScheduledTask"))!;
    expect(settings).toContain("(Get-ScheduledTask -TaskName 'PedeAqui Impressao').Settings");
    expect(settings).toContain("$settings.DisallowStartIfOnBatteries=$false");
    expect(settings).toContain("$settings.StopIfGoingOnBatteries=$false");
    expect(settings).not.toContain("New-ScheduledTaskSettingsSet");
  });
});

// Run the actual generated ACL commands against a disposable directory on Windows.
// No agent credentials, download, printer operation or production API is used.
describe.skipIf(process.platform !== "win32")("Windows installation regressions", () => {
  it("repairs an existing file with a protected empty DACL", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "pedeaqui-acl-"));
    mkdirSync(path.join(directory, "src"));
    const file = path.join(directory, "run.cmd");
    writeFileSync(file, "@echo off\r\nexit /b 0\r\n");
    try {
      const strip = spawnSync("icacls.exe", [file, "/inheritance:r"], { encoding: "utf8" });
      expect(strip.status, strip.stderr).toBe(0);
      const acl = lines.filter(line => line.startsWith("icacls") &&
        (line.includes("/inheritance:r") || line.includes('APP_DIR%\\*')));
      const script = path.join(directory, "repair.cmd");
      writeFileSync(script, `@echo off\r\nset "APP_DIR=${directory}"\r\n${acl.join("\r\n")}\r\n`);
      const repair = spawnSync("cmd.exe", ["/d", "/c", script], { encoding: "utf8" });
      expect(repair.status, repair.stderr).toBe(0);
      const inspect = spawnSync("powershell.exe", ["-NoProfile", "-Command",
        '$acl=[System.IO.File]::GetAccessControl($env:PEDEAQUI_TEST_FILE); if ($acl.AreAccessRulesProtected -or -not @($acl.Access | Where-Object {$_.IsInherited}).Count) {exit 1}',
      ], { encoding: "utf8", env: { ...process.env, PEDEAQUI_TEST_FILE: file } });
      expect(inspect.status, inspect.stderr).toBe(0);
      expect(spawnSync("cmd.exe", ["/d", "/c", file]).status).toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("allows battery execution without changing the task's other settings", () => {
    const name = `PedeAqui Installer Test ${process.pid}`;
    const settingsLine = lines.find(line => line.includes("Set-ScheduledTask"))!;
    const start = settingsLine.indexOf('-Command "') + '-Command "'.length;
    const command = settingsLine.slice(start, -1).replaceAll("PedeAqui Impressao", name);
    const setup = [
      "$ErrorActionPreference='Stop'",
      "$name=$env:PEDEAQUI_TEST_TASK",
      "$action=New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit 0'",
      "$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew",
      "Register-ScheduledTask -TaskName $name -Action $action -Settings $settings -Force | Out-Null",
      "try {",
      command,
      "$after=(Get-ScheduledTask -TaskName $name).Settings",
      "if ($after.DisallowStartIfOnBatteries -or $after.StopIfGoingOnBatteries -or $after.MultipleInstances -ne 2) {throw 'Unexpected task settings'}",
      "} finally { Unregister-ScheduledTask -TaskName $name -Confirm:$false }",
    ].join("\n");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", setup], {
      encoding: "utf8", timeout: 60_000,
      env: { ...process.env, PEDEAQUI_TEST_TASK: name },
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  }, 65_000);
});
