param()

$ErrorActionPreference = "SilentlyContinue"
$ServiceName = "PedeAquiPrintAgent"
$LegacyTaskName = "PedeAqui Impressao"
$Root = Join-Path $env:ProgramData "PedeAqui\PrintAgent"
$DataDir = Join-Path $Root "data"
$StatePath = Join-Path $Root "current.json"
$PreviousPath = Join-Path $Root "previous.json"
$RejectedPath = Join-Path $Root "rejected-release.json"
$LockPath = Join-Path $DataDir "agent.lock"

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
$current = Read-Json $StatePath
$previous = Read-Json $PreviousPath
$rejected = Read-Json $RejectedPath
$lock = Read-Json $LockPath
$legacyTask = $false
& schtasks.exe /Query /TN $LegacyTaskName *> $null
if ($LASTEXITCODE -eq 0) { $legacyTask = $true }

$processes = @()
if ($current -and $current.releasePath) {
  $needle = Join-Path ([string]$current.releasePath) "src\index.mjs"
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine.Contains($needle) } |
    Select-Object ProcessId, Name)
}

[ordered]@{
  serviceInstalled = [bool]$service
  serviceStatus = if ($service) { [string]$service.Status } else { "NotInstalled" }
  activeVersion = if ($current) { [string]$current.version } else { $null }
  activePending = if ($current) { [bool]$current.pending } else { $null }
  activeAttempts = if ($current) { [int]$current.attempts } else { $null }
  previousVersion = if ($previous) { [string]$previous.version } else { $null }
  rejectedVersion = if ($rejected) { [string]$rejected.version } else { $null }
  rejectedReason = if ($rejected) { [string]$rejected.reason } else { $null }
  lockPid = if ($lock) { [int]$lock.pid } else { $null }
  matchingProcessCount = $processes.Count
  matchingProcessIds = @($processes | ForEach-Object { $_.ProcessId })
  legacyTaskPresent = $legacyTask
  spoolFiles = if (Test-Path -LiteralPath (Join-Path $DataDir "spool")) { @(Get-ChildItem -LiteralPath (Join-Path $DataDir "spool") -Filter "*.json" -File).Count } else { 0 }
  serviceLogPresent = Test-Path -LiteralPath (Join-Path $Root "logs\service-launcher.log")
} | ConvertTo-Json -Depth 5
