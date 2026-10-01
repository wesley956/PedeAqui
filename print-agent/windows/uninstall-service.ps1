param(
  [switch]$RestoreLegacy
)

$ErrorActionPreference = "Stop"
$ServiceName = "PedeAquiPrintAgent"
$LegacyTaskName = "PedeAqui Impressao"
$Root = Join-Path $env:ProgramData "PedeAqui\PrintAgent"
$ServiceExe = Join-Path $Root "service\PedeAquiPrintAgent.exe"
$BackupDir = Join-Path $Root "legacy-backup"
$LegacyTaskBackup = Join-Path $BackupDir "PedeAqui-Impressao-task.xml"
$LegacyStartup = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\StartUp\PedeAqui-Impressao.vbs"
$LegacyStartupBackup = Join-Path $BackupDir "PedeAqui-Impressao-startup.vbs"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Execute a desinstalacao como administrador."
}

if (Test-Path -LiteralPath $ServiceExe) {
  & $ServiceExe stop *> $null
  & $ServiceExe uninstall *> $null
} else {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) { & sc.exe delete $ServiceName *> $null }
}

if ($RestoreLegacy) {
  if (Test-Path -LiteralPath $LegacyTaskBackup) {
    & schtasks.exe /Delete /TN $LegacyTaskName /F *> $null
    & schtasks.exe /Create /TN $LegacyTaskName /XML $LegacyTaskBackup /F *> $null
    & schtasks.exe /Change /TN $LegacyTaskName /ENABLE *> $null
    & schtasks.exe /Run /TN $LegacyTaskName *> $null
  } elseif (Test-Path -LiteralPath $LegacyStartupBackup) {
    Copy-Item -LiteralPath $LegacyStartupBackup -Destination $LegacyStartup -Force
    Start-Process -FilePath "wscript.exe" -ArgumentList ('"{0}"' -f $LegacyStartup) -WindowStyle Hidden
  } else {
    Write-Warning "Nao existe bootstrap legado salvo para restauracao automatica."
  }
}

Write-Host "Servico profissional removido."
Write-Host "Dados, token, releases, spool e historico foram preservados em $Root."
if ($RestoreLegacy) { Write-Host "Restauracao do bootstrap legado foi solicitada sem apagar a instalacao profissional." }
