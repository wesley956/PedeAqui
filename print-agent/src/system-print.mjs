import { spawn } from "node:child_process";
import { escposDocument } from "./escpos.mjs";

const DEFAULT_COMMAND_TIMEOUT_MS = 12000;
const PRINT_COMMAND_TIMEOUT_MS = 25000;

function requireWindows() {
  if (process.platform !== "win32") {
    throw new Error("system printer transport is currently available on Windows only");
  }
}

function printerName(value) {
  const name = String(value || "").trim();
  if (!name) throw new Error("Windows printer requires the installed printer name");
  return name;
}

function runPowerShell(script, environment = {}, { timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      const error = new Error(`Comando de impressão do Windows excedeu ${Math.round(timeoutMs / 1000)}s e foi interrompido para recuperação automática.`);
      error.code = "PEDEAQUI_WINDOWS_PRINT_TIMEOUT";
      reject(error);
    }, timeoutMs);
    timer.unref?.();

    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Windows print command exited with code ${code}`));
    }));
  });
}

async function ensureSpoolerRunning() {
  const output = await runPowerShell(String.raw`
$ErrorActionPreference = 'Stop'
$service = Get-Service -Name Spooler -ErrorAction Stop
if ($service.Status -ne 'Running') {
  try {
    Start-Service -Name Spooler -ErrorAction Stop
    $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(8))
  } catch {
    throw "O Spooler de Impressao do Windows esta parado e o PedeAqui nao conseguiu inicia-lo automaticamente. $($_.Exception.Message)"
  }
}
$service = Get-Service -Name Spooler -ErrorAction Stop
if ($service.Status -ne 'Running') { throw "O Spooler de Impressao do Windows nao ficou ativo." }
$service.Status.ToString()
`, {}, { timeoutMs: 12000 });
  return output === "Running";
}

async function removeOwnQueuedDocument(printer, documentName) {
  if (!documentName) return 0;
  const output = await runPowerShell(String.raw`
$ErrorActionPreference = 'Stop'
$jobs = @(Get-PrintJob -PrinterName $env:PEDEAQUI_PRINTER_NAME -ErrorAction SilentlyContinue | Where-Object { $_.DocumentName -eq $env:PEDEAQUI_PRINT_DOC_NAME })
$count = $jobs.Count
foreach ($job in $jobs) {
  Remove-PrintJob -PrinterName $env:PEDEAQUI_PRINTER_NAME -ID $job.ID -ErrorAction SilentlyContinue
}
Write-Output $count
`, {
    PEDEAQUI_PRINTER_NAME: printer,
    PEDEAQUI_PRINT_DOC_NAME: documentName,
  }, { timeoutMs: 8000 });
  return Number(output || 0) || 0;
}

export async function listSystemPrinters() {
  requireWindows();
  const output = await runPowerShell(
    "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress",
  );
  if (!output) return [];
  const parsed = JSON.parse(output);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      name: String(row?.Name || "").trim(),
      isDefault: Boolean(row?.Default),
      workOffline: Boolean(row?.WorkOffline),
      status: Number(row?.PrinterStatus || 0),
    }))
    .filter((row) => row.name)
    .slice(0, 100);
}

export async function probeSystem({ address }) {
  requireWindows();
  const name = printerName(address);
  await ensureSpoolerRunning();
  await runPowerShell(
    "$ErrorActionPreference='Stop'; Get-Printer -Name $env:PEDEAQUI_PRINTER_NAME -ErrorAction Stop | Out-Null",
    { PEDEAQUI_PRINTER_NAME: name },
    { timeoutMs: 8000 },
  );
}

const rawPrintScript = String.raw`
$ErrorActionPreference = 'Stop'
$source = @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class PedeAquiRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOC_INFO_1 {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true, CharSet = CharSet.Unicode)] static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] DOC_INFO_1 di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static void Print(string printerName, string documentName, byte[] data, int copies) {
    IntPtr printer = IntPtr.Zero;
    if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      for (int copy = 0; copy < copies; copy++) {
        var doc = new DOC_INFO_1 { pDocName = documentName, pDataType = "RAW", pOutputFile = null };
        if (StartDocPrinter(printer, 1, doc) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
          if (!StartPagePrinter(printer)) throw new Win32Exception(Marshal.GetLastWin32Error());
          IntPtr unmanaged = Marshal.AllocCoTaskMem(data.Length);
          try {
            Marshal.Copy(data, 0, unmanaged, data.Length);
            int written;
            if (!WritePrinter(printer, unmanaged, data.Length, out written) || written != data.Length) {
              throw new Win32Exception(Marshal.GetLastWin32Error());
            }
          } finally {
            Marshal.FreeCoTaskMem(unmanaged);
            EndPagePrinter(printer);
          }
        } finally {
          EndDocPrinter(printer);
        }
      }
    } finally {
      ClosePrinter(printer);
    }
  }
}
"@
Add-Type -TypeDefinition $source -Language CSharp
$bytes = [Convert]::FromBase64String($env:PEDEAQUI_PRINT_PAYLOAD)
$copies = [Math]::Max(1, [int]$env:PEDEAQUI_PRINT_COPIES)
[PedeAquiRawPrinter]::Print($env:PEDEAQUI_PRINTER_NAME, $env:PEDEAQUI_PRINT_DOC_NAME, $bytes, $copies)
`;

export async function printSystem({ address }, text, copies = 1, jobId = null) {
  requireWindows();
  const name = printerName(address);
  const safeJobId = String(jobId || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 48);
  const documentName = safeJobId ? `PedeAqui:${safeJobId}` : "PedeAqui";
  const payload = escposDocument(text).toString("base64");

  await ensureSpoolerRunning();
  try {
    await runPowerShell(rawPrintScript, {
      PEDEAQUI_PRINTER_NAME: name,
      PEDEAQUI_PRINT_DOC_NAME: documentName,
      PEDEAQUI_PRINT_PAYLOAD: payload,
      PEDEAQUI_PRINT_COPIES: String(Math.max(1, Number(copies) || 1)),
    }, { timeoutMs: PRINT_COMMAND_TIMEOUT_MS });
  } catch (error) {
    let cleanupNote = "";
    try {
      const removed = await removeOwnQueuedDocument(name, documentName);
      if (removed > 0) cleanupNote = ` O PedeAqui removeu ${removed} trabalho(s) travado(s) dele mesmo da fila do Windows para permitir nova tentativa segura.`;
    } catch (cleanupError) {
      const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      cleanupNote = ` A limpeza automatica do trabalho do PedeAqui tambem falhou: ${detail}`;
    }
    try { await ensureSpoolerRunning(); } catch { /* o erro original permanece como causa principal */ }
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}${cleanupNote}`.slice(0, 2000));
  }
}
