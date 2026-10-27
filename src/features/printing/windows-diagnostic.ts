/** Read-only Windows diagnosis. No credential is embedded in the download or report. */
export function windowsPrintingDiagnostic(appUrl: string) {
  const origin = new URL(appUrl).origin;
  if (!/^https?:\/\//.test(origin)) throw new Error("invalid_app_origin");
  const script = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$base = '${origin}'
$report = [ordered]@{ diagnostic = 'PedeAqui printing 1291'; checkedAt = (Get-Date).ToString('o') }
$roots = @([IO.Path]::Combine($env:ProgramData,'PedeAqui','PrintAgent'), [IO.Path]::Combine($env:LOCALAPPDATA,'PedeAqui','PrintAgent'))
$installed = @($roots | Where-Object { Test-Path ([IO.Path]::Combine($_,'run.cmd')) })
$report.installationsFound = $installed.Count
try {
  $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'PedeAqui[\\\\/]PrintAgent[\\\\/]src[\\\\/]index\\.mjs' })
  $report.agentProcesses = $processes.Count
} catch { $report.agentProcesses = 'unavailable' }
try {
  $task = Get-ScheduledTask -TaskName 'PedeAqui Impressao'
  $info = Get-ScheduledTaskInfo -TaskName 'PedeAqui Impressao'
  $report.startupTask = [ordered]@{ state = [string]$task.State; lastResult = $info.LastTaskResult; lastRun = [string]$info.LastRunTime; batteryStartBlocked = $task.Settings.DisallowStartIfOnBatteries; stopsOnBattery = $task.Settings.StopIfGoingOnBatteries }
} catch { $report.startupTask = 'not_found_or_access_denied' }
try { $report.spooler = [string](Get-Service -Name Spooler).Status } catch { $report.spooler = 'unavailable' }
try {
  $report.epson = @(Get-CimInstance Win32_Printer | Where-Object { $_.Name -match 'EPSON|TM-T' } | ForEach-Object { [ordered]@{ name = $_.Name; status = $_.PrinterStatus; workOffline = $_.WorkOffline; detectedError = $_.DetectedErrorState } })
} catch { $report.epson = 'unavailable' }
function HttpCode($failure) {
  try { if ($null -eq $failure.Exception.Response) { return 'network_or_timeout' }; return [int]$failure.Exception.Response.StatusCode } catch { return 'network_or_timeout' }
}
try { $report.siteHttp = [int](Invoke-WebRequest -UseBasicParsing -Uri ($base + '/api/health') -TimeoutSec 10).StatusCode } catch { $report.siteHttp = HttpCode $_ }
if ($installed.Count -gt 0) {
  $root = $installed[0]
  try { $report.version = (Get-Content -Raw ([IO.Path]::Combine($root,'package.json')) | ConvertFrom-Json).version } catch { $report.version = 'unavailable' }
  try {
    $runner = Get-Content -Raw ([IO.Path]::Combine($root,'run.cmd'))
    $token = [regex]::Match($runner, '(?im)^\\s*(?:set\\s+"?)?PEDEAQUI_PRINT_AGENT_TOKEN=([^"\\r\\n]+)').Groups[1].Value.Trim()
    $configured = [regex]::Match($runner, '(?im)^\\s*(?:set\\s+"?)?PEDEAQUI_URL=([^"\\r\\n]+)').Groups[1].Value.Trim().TrimEnd('/')
    $report.credentialPresent = -not [string]::IsNullOrWhiteSpace($token)
    $allowed = @($base, 'https://pedeaqui.pp.ua', 'https://www.pedeaqui.pp.ua')
    $report.expectedServer = $allowed -contains $configured
    if ($report.credentialPresent -and $report.expectedServer) {
      try {
        $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($configured + '/api/print-agent/config') -Headers @{ Authorization = ('Bearer ' + $token) } -ContentType 'application/json' -Body '{}' -TimeoutSec 10
        $report.agentAuthHttp = [int]$response.StatusCode
        $report.assignedPrinters = @((ConvertFrom-Json $response.Content).printers).Count
      } catch { $report.agentAuthHttp = HttpCode $_ }
    }
    $token = $null
    $runner = $null
  } catch { $report.agentAuthHttp = 'configuration_unavailable' }
}
Write-Output ($report | ConvertTo-Json -Depth 5)
Write-Output 'Envie este resumo ao suporte. Nenhuma fila, pedido, chave ou configuracao foi alterada.'
[void](Read-Host 'Pressione Enter para fechar')
`;
  // PowerShell -EncodedCommand expects UTF-16LE, including on Windows PowerShell 5.1.
  let bytes = "";
  for (let index = 0; index < script.length; index += 1) {
    const code = script.charCodeAt(index);
    bytes += String.fromCharCode(code & 255, code >> 8);
  }
  const payload = btoa(bytes).match(/.{1,100}/g)!.join("\r\n");
  // Keep the command below cmd.exe's 8191-character limit. Read the inert payload
  // from this file, without creating temporary files or interpolating its path.
  return `@echo off\r\nsetlocal EnableExtensions\r\nchcp 65001 >nul\r\ntitle PedeAqui - Diagnostico de impressao\r\nset "PEDEAQUI_DIAGNOSTIC_FILE=%~f0"\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$parts=[IO.File]::ReadAllText($env:PEDEAQUI_DIAGNOSTIC_FILE) -split '(?m)^:PEDEAQUI_DIAGNOSTIC_BASE64\\r?$'; & ([scriptblock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($parts[1]))))"\r\nif errorlevel 1 pause\r\nexit /b\r\n:PEDEAQUI_DIAGNOSTIC_BASE64\r\n${payload}\r\n`;
}
