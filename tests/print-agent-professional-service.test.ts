import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const installerClient = read("src/features/printing/agent-token-creator-client.tsx");
const installer = read("print-agent/windows/install-service.ps1");
const launcher = read("print-agent/windows/service-launcher.ps1");
const rollback = read("print-agent/windows/rollback-service.ps1");
const uninstall = read("print-agent/windows/uninstall-service.ps1");
const health = read("print-agent/windows/health-service.ps1");
const updater = read("print-agent/src/updater.mjs");
const bootstrap = read("print-agent/src/service-bootstrap.mjs");
const serviceState = read("print-agent/src/service-state.mjs");
const manifest = JSON.parse(read("print-agent/manifest.json")) as { version: string; files: string[] };

const WINSW_SHA256 = "05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da";

describe("professional Print Agent Windows gate", () => {
  it("moves the assisted installer from Scheduled Task/VBS watchdog to an SCM service", () => {
    expect(installerClient).toContain("windows/install-service.ps1");
    expect(installerClient).toContain("serviço do Windows");
    expect(installerClient).not.toContain('schtasks.exe /Create /TN "PedeAqui Impressao"');
    expect(installerClient).not.toContain("launch.vbs");
    expect(installerClient).not.toContain("goto agent_loop");

    expect(installer).toContain('$ServiceName = "PedeAquiPrintAgent"');
    expect(installer).toContain("<startmode>Automatic</startmode>");
    expect(installer).toContain("<delayedAutoStart>true</delayedAutoStart>");
    expect(installer).toContain("<onfailure action=\"restart\"");
  });

  it("pins and verifies the stable WinSW host instead of trusting an arbitrary binary", () => {
    expect(installer).toContain("winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe");
    expect(installer).toContain(WINSW_SHA256);
    expect(installer).toContain("Get-FileHash");
    expect(installer).toContain("Checksum do host de servico WinSW nao confere");
  });

  it("keeps the legacy bootstrap recoverable until the professional service validates", () => {
    const validationAt = installer.indexOf("Validate-Service $release.Path");
    const deleteLegacyAt = installer.indexOf("schtasks.exe /Delete /TN $LegacyTaskName", validationAt);
    expect(validationAt).toBeGreaterThan(-1);
    expect(deleteLegacyAt).toBeGreaterThan(validationAt);
    expect(installer).toContain("Backup-And-Stop-Legacy");
    expect(installer).toContain("Restore-Legacy $hadLegacyTask");
    expect(uninstall).toContain("[switch]$RestoreLegacy");
    expect(uninstall).toContain("Dados, token, releases, spool e historico foram preservados");
  });

  it("packages a guarded bootstrap and keeps persistent data outside immutable releases", () => {
    expect(manifest.files).toContain("src/service-state.mjs");
    expect(manifest.files).toContain("src/service-bootstrap.mjs");
    expect(launcher).toContain('PEDEAQUI_PRINT_SPOOL = Join-Path $DataDir "spool"');
    expect(serviceState).toContain('path.join(agentDataDir(), "agent.lock")');
    expect(bootstrap).toContain("acquireSingleInstance");
    expect(bootstrap).toContain("PEDEAQUI_INSTANCE_RUNNING");
    expect(bootstrap).toContain("/api/print-agent/heartbeat");
    expect(bootstrap).toContain("markCurrentReleaseHealthy");
  });

  it("stages updates as releases and activates them without overwriting the running copy", () => {
    expect(updater).toContain("stageRelease");
    expect(updater).toContain("activateRelease");
    expect(updater).toContain("staging-");
    expect(updater).toContain("health confirmation pending");
    expect(updater).not.toContain("copyFile(source, destination)");
    expect(serviceState).toContain("previous.json");
    expect(serviceState).toContain("pending: true");
    expect(launcher).toContain("automatic_rollback");
    expect(rollback).toContain("Nao existe release anterior valida para rollback");
  });

  it("quarantines a release rejected by rollback so restart cannot retry it forever", () => {
    expect(serviceState).toContain("rejected-release.json");
    expect(serviceState).toContain("markReleaseRejected");
    expect(serviceState).toContain("clearRejectedRelease");
    expect(updater).toContain("readRejectedRelease");
    expect(updater).toContain("PEDEAQUI_RETRY_REJECTED_RELEASE");
    expect(updater).toContain("automatic retry skipped");
    expect(launcher).toContain("Write-RejectedRelease");
    expect(launcher).toContain("automatic_rollback_before_heartbeat");
    expect(launcher.indexOf("Write-RejectedRelease")).toBeLessThan(launcher.indexOf('Write-LauncherLog "automatic_rollback'));
    expect(rollback).toContain('Write-RejectedRelease ([string]$current.version) "manual_rollback"');
  });

  it("keeps diagnostics free of the persisted token and avoids destructive cleanup", () => {
    expect(health).not.toContain("service.env.json");
    expect(health).not.toContain("token");
    expect(health).toContain("matchingProcessCount");
    expect(health).toContain("spoolFiles");
    expect(rollback).not.toMatch(/Remove-Item[^\n]+spool/i);
    expect(uninstall).not.toMatch(/Remove-Item[^\n]+spool/i);
  });
});
