import { spawn } from "node:child_process";
import { freemem, uptime } from "node:os";
import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

// Fixed, read-only scripts. The server supplies only a UUID and expiry, never
// PowerShell, paths, URLs or arguments. Command lines and printer names stay local.
export const windowsChecks = {
  startup: `try { $t=Get-ScheduledTask -TaskName 'PedeAqui Impressao' } catch { if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { return @{taskFound=$false} }; throw }; $i=Get-ScheduledTaskInfo -TaskName 'PedeAqui Impressao'; @{taskFound=$true;taskState=[string]$t.State;lastTaskResult=[long]$i.LastTaskResult;blocksBattery=[bool]$t.Settings.DisallowStartIfOnBatteries;stopsOnBattery=[bool]$t.Settings.StopIfGoingOnBatteries;startsAtBoot=(@($t.Triggers | Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger'}).Count -gt 0);startsAtLogin=(@($t.Triggers | Where-Object {$_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger'}).Count -gt 0);serviceAccount=([string]$t.Principal.LogonType -eq 'ServiceAccount')}`,
  processes: `$p=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -match 'PedeAqui[\\/]PrintAgent[\\/]src[\\/]index\\.mjs'}); @{agentProcesses=$p.Count}`,
  spooler: `@{serviceRunning=((Get-Service -Name Spooler).Status -eq 'Running')}`,
  printers: `$p=@(Get-CimInstance Win32_Printer | Where-Object {$_.Name -match 'EPSON|TM-T'}); $q=@(Get-CimInstance Win32_PrintJob); @{printerCount=$p.Count;offlineCount=@($p | Where-Object {$_.WorkOffline}).Count;errorCount=@($p | Where-Object {$_.DetectedErrorState -gt 2}).Count;queuedJobs=$q.Count}`,
  power: `$k='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\User\\PowerSchemes'; $a=(Get-ItemProperty -LiteralPath $k).ActivePowerScheme; $s=Get-ItemProperty -LiteralPath ($k+'\\'+$a+'\\238c9fa8-0aad-41ed-83f4-97be242c8f20\\29f6c1db-86da-48c5-9fdb-f2b67b1f44da'); if ($null -eq $s.ACSettingIndex -or $null -eq $s.DCSettingIndex) {throw 'unavailable'}; @{sleepOnAc=($s.ACSettingIndex -gt 0);sleepOnBattery=($s.DCSettingIndex -gt 0)}`,
};

export function runWindowsCheck(script, { spawnProcess = spawn, timeoutMs = 8000 } = {}) {
  return new Promise(resolve => {
    let child;
    let output = "";
    let done = false;
    let timer;
    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    }
    const wrapped = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try { $v=& { ${script} }; ConvertTo-Json -Compress -InputObject $v } catch { if ($_.Exception -is [UnauthorizedAccessException]) {exit 5}; exit 1 }`;
    try {
      child = spawnProcess("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(wrapped, "utf16le").toString("base64")], {
        windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
        // Credentials are not needed by the read-only Windows probes.
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/TOKEN|SECRET|PASSWORD|KEY|PEDEAQUI_URL/i.test(key))),
      });
      timer = setTimeout(() => { child.kill(); finish({ status: "timeout", code: "timeout", values: {} }); }, timeoutMs);
      child.stdout.on("data", chunk => {
        output += chunk.toString("utf8");
        if (output.length > 8192) { child.kill(); finish({ status: "error", code: "invalid_output", values: {} }); }
      });
      child.on("error", () => finish({ status: "unavailable", code: "command_failed", values: {} }));
      child.on("close", code => {
        if (code !== 0) return finish({ status: "unavailable", code: code === 5 ? "access_denied" : "command_failed", values: {} });
        try {
          const values = JSON.parse(output.replace(/^\uFEFF/, "").trim());
          if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("invalid");
          finish({ status: "ok", code: "checked", values });
        } catch { finish({ status: "error", code: "invalid_output", values: {} }); }
      });
    } catch { finish({ status: "unavailable", code: "command_failed", values: {} }); }
  });
}

// This allowlist mirrors the server contract. Do not collect or serialize raw
// exception messages, process environments, paths, names, document text or logs.
const numericKeys = new Set(["uptimeSeconds", "freeMemoryMb", "lastTaskResult", "agentProcesses", "printerCount", "offlineCount", "errorCount", "queuedJobs", "httpStatus", "assignedPrinters"]);
const booleanKeys = new Set(["writable", "taskFound", "blocksBattery", "stopsOnBattery", "startsAtBoot", "startsAtLogin", "serviceAccount", "serviceRunning", "sleepOnAc", "sleepOnBattery"]);
function safeValues(input) {
  const values = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (numericKeys.has(key) && typeof value === "number" && Number.isFinite(value)) values[key] = value;
    if (booleanKeys.has(key) && typeof value === "boolean") values[key] = value;
    if (key === "taskState" && ["Unknown", "Disabled", "Queued", "Ready", "Running"].includes(value)) values[key] = value;
  }
  return values;
}

export async function collectDiagnostic({ apiUrl, post, version, directory, platform = process.platform, windowsCheck = runWindowsCheck, fetcher = fetch, now = () => new Date().toISOString() }) {
  const startedAt = now();
  const checks = [];
  const add = (name, result) => checks.push({ name, ...result, values: safeValues(result.values) });
  add("runtime", { status: "ok", code: "checked", values: { uptimeSeconds: uptime(), freeMemoryMb: Math.round(freemem() / 1048576) } });
  try {
    await mkdir(directory, { recursive: true });
    const probe = path.join(directory, `.probe-${process.pid}`);
    const file = await open(probe, "wx", 0o600);
    await file.close();
    await unlink(probe);
    add("storage", { status: "ok", code: "checked", values: { writable: true } });
  } catch { add("storage", { status: "error", code: "storage_failed", values: { writable: false } }); }

  for (const [name, script] of Object.entries(windowsChecks)) {
    let result;
    try { result = platform === "win32" ? await windowsCheck(script) : { status: "unavailable", code: "not_windows", values: {} }; }
    catch { result = { status: "unavailable", code: "command_failed", values: {} }; }
    const v = result.values ?? {};
    if (result.status === "ok" && (v.blocksBattery || v.stopsOnBattery || v.taskFound === false || v.taskState === "Disabled" || v.serviceRunning === false || v.agentProcesses === 0 || v.agentProcesses > 1 || v.printerCount === 0 || v.offlineCount > 0 || v.errorCount > 0 || v.sleepOnAc)) result.status = "warning";
    add(name, result);
  }
  for (const [name, url] of [["connectivity", `${apiUrl}/api/health`], ["updates", "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent/manifest.json"]]) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
      await response.body?.cancel();
      add(name, { status: response.ok ? "ok" : "warning", code: "checked", values: { httpStatus: response.status } });
    } catch { add(name, { status: "error", code: "network_error", values: {} }); }
  }
  try {
    const config = await post("/api/print-agent/config");
    add("authentication", { status: "ok", code: "checked", values: { assignedPrinters: Array.isArray(config.printers) ? config.printers.length : 0 } });
  } catch (error) { add("authentication", { status: "error", code: error.status === 401 || error.status === 403 ? "unauthorized" : "network_error", values: {} }); }
  return { schemaVersion: 1, agentVersion: version, platform: ["win32", "linux", "darwin"].includes(platform) ? platform : "other", startedAt, finishedAt: now(), checks };
}
