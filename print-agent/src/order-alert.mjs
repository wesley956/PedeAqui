import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(agentRoot, ".cache");
const audioPath = path.join(cacheDir, "pedeaqui-pedido.mp3");
const audioRefreshMs = 24 * 60 * 60 * 1000;
let cursor = null;
let pollRunning = false;

export function nativeOrderAlertSupported() {
  return process.platform === "win32" && process.env.PEDEAQUI_NATIVE_ORDER_ALERTS !== "0";
}

function runPowerShell(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", script,
    ], {
      windowsHide: true,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error((stderr || `PowerShell exited ${code}`).slice(0, 1000)));
    });
  });
}

async function ensureAudio(apiUrl) {
  let current = null;
  try {
    current = await stat(audioPath);
  } catch {
    current = null;
  }
  if (current && Date.now() - current.mtimeMs < audioRefreshMs) return audioPath;

  try {
    const response = await fetch(`${apiUrl}/audio/pedeaqui-pedido.mp3?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`audio download ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 256) throw new Error("downloaded alert audio is unexpectedly small");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(audioPath, buffer);
    return audioPath;
  } catch (error) {
    if (current) return audioPath;
    throw error;
  }
}

async function playMp3(filePath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName PresentationCore",
    "$player = New-Object System.Windows.Media.MediaPlayer",
    "$player.Open([Uri]::new($env:PEDEAQUI_ALERT_AUDIO))",
    "$deadline = [DateTime]::UtcNow.AddSeconds(5)",
    "while (-not $player.NaturalDuration.HasTimeSpan -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }",
    "$player.Volume = 1.0",
    "$player.Play()",
    "$duration = if ($player.NaturalDuration.HasTimeSpan) { [int]$player.NaturalDuration.TimeSpan.TotalMilliseconds } else { 2500 }",
    "$duration = [Math]::Max(1200, [Math]::Min(6000, $duration + 350))",
    "Start-Sleep -Milliseconds $duration",
    "$player.Stop()",
    "$player.Close()",
  ].join("; ");
  await runPowerShell(script, { PEDEAQUI_ALERT_AUDIO: filePath });
}

async function playSystemFallback() {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "[System.Media.SystemSounds]::Exclamation.Play()",
    "Start-Sleep -Milliseconds 350",
    "[System.Media.SystemSounds]::Asterisk.Play()",
    "Start-Sleep -Milliseconds 700",
  ].join("; ");
  await runPowerShell(script);
}

async function playNativeAlert(apiUrl) {
  try {
    const filePath = await ensureAudio(apiUrl);
    await playMp3(filePath);
  } catch (error) {
    console.error("native order MP3 alert failed; using Windows fallback", error);
    try {
      await playSystemFallback();
    } catch (fallbackError) {
      console.error("native Windows order alert fallback failed", fallbackError);
    }
  }
}

export async function pollNativeOrderAlerts({ apiUrl, post }) {
  if (!nativeOrderAlertSupported() || pollRunning) return;
  pollRunning = true;
  try {
    const result = await post("/api/print-agent/order-alerts", { cursor });
    if (typeof result?.cursor === "string") cursor = result.cursor;
    const orders = Array.isArray(result?.orders) ? result.orders : [];
    if (!result?.nativeEnabled || result?.panelActive || orders.length === 0) return;

    const labels = orders
      .map((order) => Number.isFinite(Number(order?.displayNumber)) ? `#${Number(order.displayNumber)}` : null)
      .filter(Boolean)
      .slice(0, 5)
      .join(", ");
    console.log(`native new-order alert${labels ? ` ${labels}` : ""}`);
    await playNativeAlert(apiUrl);
  } catch (error) {
    console.error("native order alert poll failed", error);
  } finally {
    pollRunning = false;
  }
}
