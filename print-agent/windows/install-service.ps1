param(
  [string]$AppUrl = $env:PEDEAQUI_INSTALL_URL,
  [string]$Token = $env:PEDEAQUI_INSTALL_TOKEN,
  [string]$RawRoot = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ServiceName = "PedeAquiPrintAgent"
$LegacyTaskName = "PedeAqui Impressao"
$Root = Join-Path $env:ProgramData "PedeAqui\PrintAgent"
$ServiceDir = Join-Path $Root "service"
$ReleasesDir = Join-Path $Root "releases"
$DataDir = Join-Path $Root "data"
$LogsDir = Join-Path $Root "logs"
$BackupDir = Join-Path $Root "legacy-backup"
$DownloadDir = Join-Path $env:TEMP "PedeAqui-PrintAgent-Service"
$StatePath = Join-Path $Root "current.json"
$PreviousPath = Join-Path $Root "previous.json"
$LegacyTaskBackup = Join-Path $BackupDir "PedeAqui-Impressao-task.xml"
$LegacyStartup = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\StartUp\PedeAqui-Impressao.vbs"
$WinSwVersion = "2.12.0"
$WinSwUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
$WinSwSha256 = "05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da"
$ServiceExe = Join-Path $ServiceDir "PedeAquiPrintAgent.exe"
$ServiceXml = Join-Path $ServiceDir "PedeAquiPrintAgent.xml"
$LauncherPath = Join-Path $ServiceDir "service-launcher.ps1"

function Import-LegacyEnvironment {
  if ($AppUrl -and $Token) { return }
  $runCmd = Join-Path $Root "run.cmd"
  if (-not (Test-Path -LiteralPath $runCmd)) { return }

  $content = Get-Content -LiteralPath $runCmd -Raw -Encoding UTF8
  if (-not $AppUrl) {
    $urlMatch = [regex]::Match($content, '(?im)^set\s+"PEDEAQUI_URL=([^"]+)"\s*$')
    if ($urlMatch.Success) { $script:AppUrl = $urlMatch.Groups[1].Value.Trim() }
  }
  if (-not $Token) {
    $tokenMatch = [regex]::Match($content, '(?im)^set\s+"PEDEAQUI_PRINT_AGENT_TOKEN=([^"]+)"\s*$')
    if ($tokenMatch.Success) { $script:Token = $tokenMatch.Groups[1].Value.Trim() }
  }
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "A instalacao precisa ser executada como administrador."
  }
}

function Get-NodeExecutable {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }
  $programFilesNode = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if (Test-Path -LiteralPath $programFilesNode) { return $programFilesNode }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    & $winget.Source install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) { return $node.Source }
    if (Test-Path -LiteralPath $programFilesNode) { return $programFilesNode }
  }
  throw "Node.js LTS nao foi encontrado e nao pode ser instalado automaticamente."
}

function Write-JsonAtomic([string]$Path, $Value) {
  $temp = "$Path.$PID.$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).tmp"
  $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
  Move-Item -LiteralPath $temp -Destination $Path -Force
}

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Download-File([string]$Url, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination -TimeoutSec 30
  if ((Get-Item -LiteralPath $Destination).Length -le 0) { throw "Download vazio: $Url" }
}

function Assert-SafeRelativePath([string]$Value) {
  $normalized = $Value.Replace("\", "/").TrimStart("/")
  if (-not $normalized -or $normalized.Contains("../") -or $normalized.Contains("/..") -or [IO.Path]::IsPathRooted($normalized)) {
    throw "Caminho inseguro no manifesto: $Value"
  }
  return $normalized
}

function Install-Release([string]$NodeExe) {
  $manifestPath = Join-Path $DownloadDir "manifest.json"
  Download-File "$RawRoot/manifest.json" $manifestPath
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = [string]$manifest.version
  if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Versao invalida no manifesto do Print Agent." }
  if (-not $manifest.files -or $manifest.files.Count -gt 40) { throw "Lista de arquivos invalida no manifesto do Print Agent." }

  $releasePath = Join-Path $ReleasesDir $version
  $stagingPath = Join-Path $ReleasesDir (".{0}.staging-{1}" -f $version, $PID)
  Remove-Item -LiteralPath $stagingPath -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $stagingPath | Out-Null

  foreach ($file in $manifest.files) {
    $relative = Assert-SafeRelativePath ([string]$file)
    $target = Join-Path $stagingPath $relative
    Download-File "$RawRoot/$relative" $target
    if ($relative.EndsWith(".mjs", [StringComparison]::OrdinalIgnoreCase)) {
      & $NodeExe --check $target
      if ($LASTEXITCODE -ne 0) { throw "Modulo JavaScript invalido: $relative" }
    }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $stagingPath "src\index.mjs"))) { throw "Release sem entrypoint." }
  if (Test-Path -LiteralPath $releasePath) {
    Remove-Item -LiteralPath $stagingPath -Recurse -Force
  } else {
    Move-Item -LiteralPath $stagingPath -Destination $releasePath
  }

  $oldCurrent = Read-Json $StatePath
  if ($oldCurrent -and $oldCurrent.releasePath -and (Test-Path -LiteralPath ([string]$oldCurrent.releasePath))) {
    Write-JsonAtomic $PreviousPath $oldCurrent
  }
  Write-JsonAtomic $StatePath ([ordered]@{
    version = $version
    releasePath = $releasePath
    pending = $false
    attempts = 0
    activatedAt = [DateTimeOffset]::UtcNow.ToString("o")
  })
  return @{ Version = $version; Path = $releasePath }
}

function Backup-And-Stop-Legacy {
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $taskExists = $false
  & schtasks.exe /Query /TN $LegacyTaskName *> $null
  if ($LASTEXITCODE -eq 0) {
    $taskExists = $true
    $xml = & schtasks.exe /Query /TN $LegacyTaskName /XML
    if ($LASTEXITCODE -eq 0 -and $xml) { $xml | Set-Content -LiteralPath $LegacyTaskBackup -Encoding Unicode }
    & schtasks.exe /End /TN $LegacyTaskName *> $null
    & schtasks.exe /Change /TN $LegacyTaskName /DISABLE *> $null
  }

  foreach ($name in @("run.cmd", "launch.vbs")) {
    $source = Join-Path $Root $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $BackupDir $name) -Force }
  }
  if (Test-Path -LiteralPath $LegacyStartup) {
    Copy-Item -LiteralPath $LegacyStartup -Destination (Join-Path $BackupDir "PedeAqui-Impressao-startup.vbs") -Force
    Remove-Item -LiteralPath $LegacyStartup -Force
  }

  $legacyNeedle = [IO.Path]::Combine($Root, "src", "index.mjs")
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine.Contains($legacyNeedle) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  return $taskExists
}

function Restore-Legacy([bool]$HadLegacyTask) {
  try {
    if ($HadLegacyTask -and (Test-Path -LiteralPath $LegacyTaskBackup)) {
      & schtasks.exe /Delete /TN $LegacyTaskName /F *> $null
      & schtasks.exe /Create /TN $LegacyTaskName /XML $LegacyTaskBackup /F *> $null
      & schtasks.exe /Change /TN $LegacyTaskName /ENABLE *> $null
      & schtasks.exe /Run /TN $LegacyTaskName *> $null
      return
    }
    $startupBackup = Join-Path $BackupDir "PedeAqui-Impressao-startup.vbs"
    if (Test-Path -LiteralPath $startupBackup) {
      Copy-Item -LiteralPath $startupBackup -Destination $LegacyStartup -Force
      Start-Process -FilePath "wscript.exe" -ArgumentList ('"{0}"' -f $LegacyStartup) -WindowStyle Hidden
    }
  } catch {
    Write-Warning "Falha ao restaurar bootstrap legado automaticamente. Backup preservado em $BackupDir"
  }
}

function Remove-ExistingProfessionalService {
  if (Test-Path -LiteralPath $ServiceExe) {
    & $ServiceExe stop *> $null
    & $ServiceExe uninstall *> $null
    Start-Sleep -Seconds 1
  } else {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
      Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
      & sc.exe delete $ServiceName *> $null
      Start-Sleep -Seconds 1
    }
  }
}

function Install-ServiceWrapper([string]$NodeExe) {
  New-Item -ItemType Directory -Force -Path $ServiceDir | Out-Null
  Download-File $WinSwUrl $ServiceExe
  $actualHash = (Get-FileHash -LiteralPath $ServiceExe -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $WinSwSha256) {
    Remove-Item -LiteralPath $ServiceExe -Force -ErrorAction SilentlyContinue
    throw "Checksum do host de servico WinSW nao confere."
  }
  Download-File "$RawRoot/windows/service-launcher.ps1" $LauncherPath

  $environment = [ordered]@{ url = $AppUrl.TrimEnd('/'); token = $Token; nodeExe = $NodeExe }
  Write-JsonAtomic (Join-Path $DataDir "service.env.json") $environment

  $xml = @"
<service>
  <id>$ServiceName</id>
  <name>PedeAqui Impressao</name>
  <description>Agente local de impressao do PedeAqui, gerenciado pelo Windows.</description>
  <executable>powershell.exe</executable>
  <arguments>-NoLogo -NoProfile -ExecutionPolicy Bypass -File &quot;%BASE%\service-launcher.ps1&quot;</arguments>
  <workingdirectory>%BASE%</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <onfailure action="restart" delay="5 sec" />
  <onfailure action="restart" delay="15 sec" />
  <onfailure action="restart" delay="60 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>30 sec</stoptimeout>
  <logpath>%BASE%\..\logs</logpath>
  <log mode="roll" />
</service>
"@
  Set-Content -LiteralPath $ServiceXml -Value $xml -Encoding UTF8

  & $ServiceExe install
  if ($LASTEXITCODE -ne 0) { throw "Falha ao registrar o servico PedeAquiPrintAgent." }
  & sc.exe failure $ServiceName reset= 3600 actions= restart/5000/restart/15000/restart/60000 *> $null
  & $ServiceExe start
  if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar o servico PedeAquiPrintAgent." }
}

function Migrate-Spool {
  $target = Join-Path $DataDir "spool"
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  foreach ($source in @((Join-Path $Root ".spool"), (Join-Path (Get-Location) ".spool"))) {
    if (-not (Test-Path -LiteralPath $source)) { continue }
    Get-ChildItem -LiteralPath $source -Filter "*.json" -File -ErrorAction SilentlyContinue | ForEach-Object {
      $destination = Join-Path $target $_.Name
      if (-not (Test-Path -LiteralPath $destination)) { Copy-Item -LiteralPath $_.FullName -Destination $destination }
    }
  }
}

function Validate-Service([string]$ReleasePath) {
  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    $lock = Join-Path $DataDir "agent.lock"
    $process = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -and $_.CommandLine.Contains((Join-Path $ReleasePath "src\index.mjs")) } |
      Select-Object -First 1
  } until (($service -and $service.Status -eq "Running" -and $process -and (Test-Path -LiteralPath $lock)) -or (Get-Date) -ge $deadline)

  if (-not $service -or $service.Status -ne "Running" -or -not $process) { throw "O servico profissional nao permaneceu em execucao." }
  $headers = @{ Authorization = "Bearer $Token" }
  Invoke-RestMethod -Method Post -Uri "$($AppUrl.TrimEnd('/'))/api/print-agent/config" -Headers $headers -ContentType "application/json" -Body "{}" -TimeoutSec 15 | Out-Null
}

Assert-Administrator
Import-LegacyEnvironment
if (-not $AppUrl -or -not $Token) { throw "URL ou chave do Print Agent ausente." }

New-Item -ItemType Directory -Force -Path $Root, $ServiceDir, $ReleasesDir, $DataDir, $LogsDir, $BackupDir, $DownloadDir | Out-Null
$hadLegacyTask = $false

try {
  $nodeExe = Get-NodeExecutable
  $release = Install-Release $nodeExe
  Migrate-Spool
  $hadLegacyTask = Backup-And-Stop-Legacy
  Remove-ExistingProfessionalService
  Install-ServiceWrapper $nodeExe

  icacls.exe $Root /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" /T /C *> $null
  Validate-Service $release.Path

  if ($hadLegacyTask) { & schtasks.exe /Delete /TN $LegacyTaskName /F *> $null }
  Remove-Item -LiteralPath $LegacyStartup -Force -ErrorAction SilentlyContinue
  Write-Host "PedeAqui Impressao instalado como servico Windows e validado com sucesso."
  Write-Host "Servico: $ServiceName | Release: $($release.Version)"
} catch {
  Write-Warning "A instalacao profissional falhou. Restaurando o bootstrap anterior quando disponivel."
  try { Remove-ExistingProfessionalService } catch {}
  Restore-Legacy $hadLegacyTask
  throw
} finally {
  Remove-Item -LiteralPath $DownloadDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item Env:PEDEAQUI_INSTALL_TOKEN -ErrorAction SilentlyContinue
}
