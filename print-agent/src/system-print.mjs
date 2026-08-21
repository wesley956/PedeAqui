import { spawn } from "node:child_process";
import { escposDocument } from "./escpos.mjs";

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

function runPowerShell(script, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Windows print command exited with code ${code}`));
    });
  });
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
  await runPowerShell(
    "$ErrorActionPreference='Stop'; Get-Printer -Name $env:PEDEAQUI_PRINTER_NAME -ErrorAction Stop | Out-Null",
    { PEDEAQUI_PRINTER_NAME: name },
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

  public static void Print(string printerName, byte[] data, int copies) {
    IntPtr printer = IntPtr.Zero;
    if (!OpenPrinter(printerName, out printer, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      for (int copy = 0; copy < copies; copy++) {
        var doc = new DOC_INFO_1 { pDocName = "PedeAqui", pDataType = "RAW", pOutputFile = null };
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
[PedeAquiRawPrinter]::Print($env:PEDEAQUI_PRINTER_NAME, $bytes, $copies)
`;

export async function printSystem({ address }, text, copies = 1) {
  requireWindows();
  const name = printerName(address);
  const payload = escposDocument(text).toString("base64");
  await runPowerShell(rawPrintScript, {
    PEDEAQUI_PRINTER_NAME: name,
    PEDEAQUI_PRINT_PAYLOAD: payload,
    PEDEAQUI_PRINT_COPIES: String(Math.max(1, Number(copies) || 1)),
  });
}
