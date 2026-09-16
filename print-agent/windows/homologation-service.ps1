param(
  [ValidateSet("Audit", "ExerciseRecovery", "PrepareReboot", "BootCapture")]
  [string]$Mode = "Audit",
  [string]$Root = (Join-Path $env:ProgramData "PedeAqui\PrintAgent")
)

$ErrorActionPreference = "Stop"
$ServiceName = "PedeAquiPrintAgent"
$LegacyTaskName = "PedeAqui Impressao"
$BootEvidenceTask = "PedeAqui PrintAgent Homologation Boot Evidence"
$DataDir = Join-Path $Root "data"
$EvidenceDir = Join-Path $Root "homologation-evidence"
$StatePath = Join-Path $Root "current.json"
$PreviousPath = Join-Path $Root "previous.json"
$RejectedPath = Join-Path $Root "rejected-release.json"
$LockPath = Join-Path $DataDir "agent.lock"
$EnvPath = Join-Path $DataDir "service.env.json"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute a homologacao como administrador."
  }
}

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function Get-MachineFingerprint {
  try {
    $machineGuid = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name MachineGuid).MachineGuid
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      $bytes = [Text.Encoding]::UTF8.GetBytes("PedeAqui-Homologation|$machineGuid")
      return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").Substring(0, 16).ToLowerInvariant()
    } finally { $sha.Dispose() }
  } catch { return "unavailable" }
}

function Get-SpoolSummary {
  $spool = Join-Path $DataDir "spool"
  $summary = [ordered]@{ total = 0; printed_unacked = 0; other = 0; unreadable = 0 }
  if (-not (Test-Path -LiteralPath $spool)) { return $summary }
  foreach ($file in @(Get-ChildItem -LiteralPath $spool -Filter "*.json" -File -ErrorAction SilentlyContinue)) {
    $summary.total++
    try {
      $item = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
      $state = [string]$(if ($item.state) { $item.state } elseif ($item.status) { $item.status } else { "" })
      if ($state -eq "printed_unacked") { $summary.printed_unacked++ } else { $summary.other++ }
    } catch { $summary.unreadable++ }
  }
  return $summary
}

function Get-Snapshot {
  $current = Read-Json $StatePath
  $previous = Read-Json $PreviousPath
  $rejected = Read-Json $RejectedPath
  $lock = Read-Json $LockPath
  $service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction SilentlyContinue
  $legacyTask = $false
  & schtasks.exe /Query /TN $LegacyTaskName *> $null
  if ($LASTEXITCODE -eq 0) { $legacyTask = $true }

  $processes = @()
  if ($current -and $current.releasePath) {
    $needle = Join-Path ([string]$current.releasePath) "src\index.mjs"
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine.Contains($needle) } |
      Select-Object ProcessId)
  }
  $explorerCount = @(Get-Process explorer -ErrorAction SilentlyContinue).Count
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue

  return [ordered]@{
    capturedAt = [DateTimeOffset]::UtcNow.ToString("o")
    machine = Get-MachineFingerprint
    windows = if ($os) { [ordered]@{ caption = [string]$os.Caption; version = [string]$os.Version; build = [string]$os.BuildNumber; lastBoot = ([Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)).ToUniversalTime().ToString("o") } } else { $null }
    serviceInstalled = [bool]$service
    serviceState = if ($service) { [string]$service.State } else { "NotInstalled" }
    serviceStartMode = if ($service) { [string]$service.StartMode } else { $null }
    activeVersion = if ($current) { [string]$current.version } else { $null }
    activePending = if ($current) { [bool]$current.pending } else { $null }
    previousVersion = if ($previous) { [string]$previous.version } else { $null }
    rejectedVersion = if ($rejected) { [string]$rejected.version } else { $null }
    rejectedReason = if ($rejected) { [string]$rejected.reason } else { $null }
    matchingProcessCount = $processes.Count
    lockPresent = Test-Path -LiteralPath $LockPath
    lockPid = if ($lock) { [int]$lock.pid } else { $null }
    legacyTaskPresent = $legacyTask
    interactiveExplorerCount = $explorerCount
    spool = Get-SpoolSummary
    coreHealthy = [bool]($service -and $service.State -eq "Running" -and $service.StartMode -eq "Auto" -and $processes.Count -eq 1 -and (Test-Path -LiteralPath $LockPath) -and -not $legacyTask)
  }
}

function Write-Evidence([string]$Name, $Value) {
  New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
  $stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $path = Join-Path $EvidenceDir "$stamp-$Name.json"
  $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $path -Encoding UTF8
  Write-Host "Evidence: $path"
  return $path
}

function Wait-CoreHealthy([int]$Seconds = 45) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    Start-Sleep -Seconds 2
    $snapshot = Get-Snapshot
    if ($snapshot.coreHealthy) { return $snapshot }
  } until ((Get-Date) -ge $deadline)
  throw "O Print Agent nao voltou ao estado healthy dentro da janela de homologacao."
}

function Exercise-Recovery {
  Assert-Administrator
  $before = Get-Snapshot
  if (-not $before.coreHealthy) { throw "O agente precisa estar healthy antes do teste de recovery." }
  $current = Read-Json $StatePath
  $serviceEnv = Read-Json $EnvPath
  if (-not $current -or -not $serviceEnv -or -not $serviceEnv.nodeExe -or -not $serviceEnv.url -or -not $serviceEnv.token) {
    throw "Estado/configuracao do servico incompletos para homologacao."
  }

  Restart-Service -Name $ServiceName -Force
  $afterRestart = Wait-CoreHealthy 45

  $oldUrl = $env:PEDEAQUI_URL
  $oldToken = $env:PEDEAQUI_PRINT_AGENT_TOKEN
  $oldRoot = $env:PEDEAQUI_AGENT_ROOT
  $oldData = $env:PEDEAQUI_AGENT_DATA
  try {
    $env:PEDEAQUI_URL = [string]$serviceEnv.url
    $env:PEDEAQUI_PRINT_AGENT_TOKEN = [string]$serviceEnv.token
    $env:PEDEAQUI_AGENT_ROOT = $Root
    $env:PEDEAQUI_AGENT_DATA = $DataDir
    & ([string]$serviceEnv.nodeExe) (Join-Path ([string]$current.releasePath) "src\service-bootstrap.mjs") (Join-Path ([string]$current.releasePath) "src\index.mjs") *> $null
    $secondExit = $LASTEXITCODE
  } finally {
    $env:PEDEAQUI_URL = $oldUrl; $env:PEDEAQUI_PRINT_AGENT_TOKEN = $oldToken
    $env:PEDEAQUI_AGENT_ROOT = $oldRoot; $env:PEDEAQUI_AGENT_DATA = $oldData
  }

  $process = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine.Contains((Join-Path ([string]$current.releasePath) "src\index.mjs")) } |
    Select-Object -First 1
  if (-not $process) { throw "Runtime ativo nao encontrado para teste de crash recovery." }
  $oldPid = [int]$process.ProcessId
  Stop-Process -Id $oldPid -Force
  $afterCrash = Wait-CoreHealthy 60

  $result = [ordered]@{
    scenario = "restart-single-instance-crash-recovery"
    before = $before
    restartRecovered = [bool]$afterRestart.coreHealthy
    singleInstanceExitCode = $secondExit
    singleInstancePassed = [bool]($secondExit -eq 73)
    crashedPid = $oldPid
    crashRecovered = [bool]($afterCrash.coreHealthy -and $afterCrash.lockPid -ne $oldPid)
    after = $afterCrash
    passed = [bool]($afterRestart.coreHealthy -and $secondExit -eq 73 -and $afterCrash.coreHealthy -and $afterCrash.lockPid -ne $oldPid)
  }
  Write-Evidence "recovery" $result | Out-Null
  $result | ConvertTo-Json -Depth 10
}

function Prepare-RebootEvidence {
  Assert-Administrator
  New-Item -ItemType Directory -Force -Path $EvidenceDir | Out-Null
  $harnessDir = Join-Path $Root "homologation"
  New-Item -ItemType Directory -Force -Path $harnessDir | Out-Null
  $target = Join-Path $harnessDir "homologation-service.ps1"
  Copy-Item -LiteralPath $PSCommandPath -Destination $target -Force
  $taskCommand = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$target`" -Mode BootCapture -Root `"$Root`""
  & schtasks.exe /Create /TN $BootEvidenceTask /SC ONSTART /RU SYSTEM /RL HIGHEST /TR $taskCommand /F *> $null
  if ($LASTEXITCODE -ne 0) { throw "Falha ao preparar captura de evidência no proximo boot." }
  Write-Host "Captura de reboot preparada. Reinicie a maquina e nao faca login por pelo menos 60 segundos."
}

function Capture-BootEvidence {
  Start-Sleep -Seconds 45
  $snapshot = Get-Snapshot
  $result = [ordered]@{
    scenario = "boot-without-login"
    snapshot = $snapshot
    serviceHealthyBeforeInteractiveSession = [bool]($snapshot.coreHealthy -and $snapshot.interactiveExplorerCount -eq 0)
    passed = [bool]($snapshot.coreHealthy -and $snapshot.interactiveExplorerCount -eq 0)
  }
  Write-Evidence "boot" $result | Out-Null
  & schtasks.exe /Delete /TN $BootEvidenceTask /F *> $null
}

switch ($Mode) {
  "Audit" { $snapshot = Get-Snapshot; Write-Evidence "audit" $snapshot | Out-Null; $snapshot | ConvertTo-Json -Depth 10 }
  "ExerciseRecovery" { Exercise-Recovery }
  "PrepareReboot" { Prepare-RebootEvidence }
  "BootCapture" { Capture-BootEvidence }
}
