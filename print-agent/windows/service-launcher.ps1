param()

$ErrorActionPreference = "Stop"
$Root = if ($env:PEDEAQUI_AGENT_ROOT) { $env:PEDEAQUI_AGENT_ROOT } else { Join-Path $env:ProgramData "PedeAqui\PrintAgent" }
$DataDir = Join-Path $Root "data"
$StatePath = Join-Path $Root "current.json"
$PreviousPath = Join-Path $Root "previous.json"
$EnvPath = Join-Path $DataDir "service.env.json"
$LogDir = Join-Path $Root "logs"
$LauncherLog = Join-Path $LogDir "service-launcher.log"

New-Item -ItemType Directory -Force -Path $DataDir, $LogDir | Out-Null

function Write-LauncherLog([string]$Message) {
  $line = "{0:o} {1}" -f (Get-Date), $Message
  Add-Content -Path $LauncherLog -Value $line -Encoding UTF8
}

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-JsonAtomic([string]$Path, $Value) {
  $temp = "$Path.$PID.$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).tmp"
  $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $Path -Force
}

function Normalize-Release($State) {
  if (-not $State -or -not $State.version -or -not $State.releasePath) {
    throw "Estado de release invalido."
  }
  $release = [IO.Path]::GetFullPath([string]$State.releasePath)
  $releases = [IO.Path]::GetFullPath((Join-Path $Root "releases"))
  if (-not $release.StartsWith($releases, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Release fora do diretorio autorizado."
  }
  return $State
}

function Restore-PreviousIfRequired($Current) {
  if (-not $Current.pending) { return $Current }
  $attempts = 0
  if ($null -ne $Current.attempts) { $attempts = [int]$Current.attempts }
  if ($attempts -lt 1) {
    $Current.attempts = 1
    Write-JsonAtomic $StatePath $Current
    Write-LauncherLog "release_pending_attempt version=$($Current.version)"
    return $Current
  }

  $previous = Read-JsonFile $PreviousPath
  if (-not $previous) {
    Write-LauncherLog "release_pending_without_previous version=$($Current.version)"
    return $Current
  }
  $previous = Normalize-Release $previous
  $previous.pending = $false
  $previous.attempts = 0
  Write-JsonAtomic $StatePath $previous
  Write-LauncherLog "automatic_rollback from=$($Current.version) to=$($previous.version)"
  return $previous
}

try {
  $serviceEnv = Read-JsonFile $EnvPath
  if (-not $serviceEnv -or -not $serviceEnv.url -or -not $serviceEnv.token -or -not $serviceEnv.nodeExe) {
    throw "Configuracao segura do servico ausente ou incompleta."
  }
  if (-not (Test-Path -LiteralPath ([string]$serviceEnv.nodeExe))) {
    throw "Node.js configurado para o servico nao foi encontrado."
  }

  $env:PEDEAQUI_URL = [string]$serviceEnv.url
  $env:PEDEAQUI_PRINT_AGENT_TOKEN = [string]$serviceEnv.token
  $env:PEDEAQUI_AGENT_ROOT = $Root
  $env:PEDEAQUI_AGENT_DATA = $DataDir
  $env:PEDEAQUI_PRINT_SPOOL = Join-Path $DataDir "spool"
  $env:PEDEAQUI_AGENT_SERVICE = "1"
  $env:PEDEAQUI_AGENT_WATCHDOG = "1"

  $current = Normalize-Release (Read-JsonFile $StatePath)
  $updater = Join-Path ([string]$current.releasePath) "src\updater.mjs"
  if (Test-Path -LiteralPath $updater) {
    & ([string]$serviceEnv.nodeExe) $updater
    if ($LASTEXITCODE -ne 0) {
      Write-LauncherLog "updater_exit code=$LASTEXITCODE version=$($current.version)"
    }
  }

  $current = Normalize-Release (Read-JsonFile $StatePath)
  $current = Restore-PreviousIfRequired $current
  $entry = Join-Path ([string]$current.releasePath) "src\index.mjs"
  if (-not (Test-Path -LiteralPath $entry)) {
    throw "Entrypoint da release ativa nao existe: $entry"
  }

  Write-LauncherLog "start version=$($current.version) pending=$($current.pending)"
  & ([string]$serviceEnv.nodeExe) $entry
  $code = $LASTEXITCODE
  Write-LauncherLog "exit version=$($current.version) code=$code"
  exit $code
} catch {
  Write-LauncherLog "launcher_error type=$($_.Exception.GetType().Name)"
  Write-Error $_
  exit 1
}
