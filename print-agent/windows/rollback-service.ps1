param()

$ErrorActionPreference = "Stop"
$ServiceName = "PedeAquiPrintAgent"
$Root = Join-Path $env:ProgramData "PedeAqui\PrintAgent"
$StatePath = Join-Path $Root "current.json"
$PreviousPath = Join-Path $Root "previous.json"
$ServiceExe = Join-Path $Root "service\PedeAquiPrintAgent.exe"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Execute o rollback como administrador."
  }
}

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Write-JsonAtomic([string]$Path, $Value) {
  $temp = "$Path.$PID.tmp"
  $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $Path -Force
}

Assert-Administrator
$current = Read-Json $StatePath
$previous = Read-Json $PreviousPath
if (-not $previous -or -not $previous.releasePath -or -not (Test-Path -LiteralPath ([string]$previous.releasePath))) {
  throw "Nao existe release anterior valida para rollback. Nenhum dado foi apagado."
}

if (Test-Path -LiteralPath $ServiceExe) {
  & $ServiceExe stop *> $null
} else {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
}

$previous.pending = $false
$previous.attempts = 0
Write-JsonAtomic $StatePath $previous
if ($current) { Write-JsonAtomic $PreviousPath $current }

if (Test-Path -LiteralPath $ServiceExe) {
  & $ServiceExe start
  if ($LASTEXITCODE -ne 0) { throw "Release anterior restaurada, mas o servico nao iniciou." }
} else {
  Start-Service -Name $ServiceName
}

Write-Host "Rollback concluido: release ativa $($previous.version)."
Write-Host "Spool, token, configuracao e historico foram preservados."
