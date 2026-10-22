const RAW_ROOT = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent";
const RAW_BASE = `${RAW_ROOT}/src`;

export function assistedInstaller(token: string, appUrl: string) {
  const safeToken = token.replaceAll("\"", "");
  const safeUrl = appUrl.replaceAll("\"", "").replace(/\/$/, "");
  return `@echo off\r
setlocal EnableExtensions\r
chcp 65001 >nul\r
title PedeAqui Impressao - Instalacao\r
fltmc >nul 2>&1 || (\r
  echo O Windows precisa autorizar esta instalacao uma unica vez.\r
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"\r
  exit /b\r
)\r
set "APP_DIR=%ProgramData%\\PedeAqui\\PrintAgent"\r
set "SRC_DIR=%APP_DIR%\\src"\r
set "DL_DIR=%TEMP%\\PedeAqui-PrintAgent-Download"\r
echo.\r
echo ==============================================\r
echo       PedeAqui Impressao - Instalacao\r
echo ==============================================\r
echo.\r
echo [1/4] Preparando o computador...\r
if not exist "%APP_DIR%" mkdir "%APP_DIR%"\r
if not exist "%SRC_DIR%" mkdir "%SRC_DIR%"\r
if not exist "%DL_DIR%" mkdir "%DL_DIR%"\r
icacls "%APP_DIR%" /inheritance:e /grant:r "%USERDOMAIN%\\%USERNAME%:(OI)(CI)F" /T /C >nul 2>&1\r
where node >nul 2>&1\r
if errorlevel 1 (\r
  echo O componente necessario sera instalado automaticamente.\r
  where winget >nul 2>&1\r
  if errorlevel 1 goto :node_manual\r
  winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-source-agreements --accept-package-agreements\r
)\r
set "NODE_EXE="\r
for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"\r
if not defined NODE_EXE if exist "%ProgramFiles%\\nodejs\\node.exe" set "NODE_EXE=%ProgramFiles%\\nodejs\\node.exe"\r
if not defined NODE_EXE goto :node_manual\r
echo [2/4] Baixando o PedeAqui Impressao...\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/index.mjs' -OutFile '%DL_DIR%\\index.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/escpos.mjs' -OutFile '%DL_DIR%\\escpos.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/system-print.mjs' -OutFile '%DL_DIR%\\system-print.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/spool.mjs' -OutFile '%DL_DIR%\\spool.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/order-alert.mjs' -OutFile '%DL_DIR%\\order-alert.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/job-style.mjs' -OutFile '%DL_DIR%\\job-style.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/updater.mjs' -OutFile '%DL_DIR%\\updater.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_ROOT}/package.json' -OutFile '%DL_DIR%\\package.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_ROOT}/manifest.json' -OutFile '%DL_DIR%\\manifest.download'"\r
if errorlevel 1 goto :download_error\r
schtasks.exe /End /TN "PedeAqui Impressao" >nul 2>&1\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$root=[IO.Path]::Combine($env:ProgramData,'PedeAqui','PrintAgent'); $index=[IO.Path]::Combine($root,'src','index.mjs'); $updater=[IO.Path]::Combine($root,'src','updater.mjs'); $runner=[IO.Path]::Combine($root,'run.cmd'); $launcher=[IO.Path]::Combine($root,'launch.vbs'); Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and (($_.Name -eq 'node.exe' -and ($_.CommandLine.Contains($index) -or $_.CommandLine.Contains($updater))) -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine.Contains($runner)) -or ($_.Name -in @('wscript.exe','cscript.exe') -and $_.CommandLine.Contains($launcher))) } | Sort-Object @{Expression={if ($_.Name -eq 'cmd.exe') {0} else {1}}} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1\r
copy /Y "%DL_DIR%\\index.download" "%SRC_DIR%\\index.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\escpos.download" "%SRC_DIR%\\escpos.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\system-print.download" "%SRC_DIR%\\system-print.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\spool.download" "%SRC_DIR%\\spool.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\order-alert.download" "%SRC_DIR%\\order-alert.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\job-style.download" "%SRC_DIR%\\job-style.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\updater.download" "%SRC_DIR%\\updater.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\package.download" "%APP_DIR%\\package.json" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\manifest.download" "%APP_DIR%\\manifest.json" >nul || goto :permission_error\r
del /Q "%DL_DIR%\\*.download" >nul 2>&1\r
echo [3/4] Conectando com sua unidade...\r
(\r
  echo @echo off\r
  echo setlocal EnableExtensions\r
  echo set "PEDEAQUI_URL=${safeUrl}"\r
  echo set "PEDEAQUI_PRINT_AGENT_TOKEN=${safeToken}"\r
  echo set "PEDEAQUI_AGENT_WATCHDOG=1"\r
  echo :agent_loop\r
  echo "%NODE_EXE%" "%ProgramData%\\PedeAqui\\PrintAgent\\src\\updater.mjs"\r
  echo "%NODE_EXE%" "%ProgramData%\\PedeAqui\\PrintAgent\\src\\index.mjs"\r
  echo timeout /t 5 /nobreak ^>nul\r
  echo goto agent_loop\r
) > "%APP_DIR%\\run.cmd"\r
(\r
  echo Set shell = CreateObject^("WScript.Shell"^)\r
  echo shell.Run Chr^(34^) ^& "%APP_DIR%\\run.cmd" ^& Chr^(34^), 0, False\r
) > "%APP_DIR%\\launch.vbs"\r
icacls "%APP_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-19:(OI)(CI)M" >nul 2>&1\r
if errorlevel 1 goto :permission_error\r
icacls "%APP_DIR%\\*" /inheritance:e /T /C >nul 2>&1\r
if errorlevel 1 goto :permission_error\r
echo Criando inicializacao protegida junto com o Windows...\r
schtasks.exe /Delete /TN "PedeAqui Impressao" /F >nul 2>&1\r
schtasks.exe /Create /TN "PedeAqui Impressao" /TR "wscript.exe \"%APP_DIR%\\launch.vbs\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F\r
if errorlevel 1 goto :task_fallback\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $settings=(Get-ScheduledTask -TaskName 'PedeAqui Impressao').Settings; $settings.DisallowStartIfOnBatteries=$false; $settings.StopIfGoingOnBatteries=$false; Set-ScheduledTask -TaskName 'PedeAqui Impressao' -Settings $settings | Out-Null"\r
if errorlevel 1 goto :validation_error\r
del /Q "%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp\\PedeAqui-Impressao.vbs" >nul 2>&1\r
schtasks.exe /Run /TN "PedeAqui Impressao" >nul 2>&1\r
goto :validate\r
:task_fallback\r
echo O Agendador do Windows bloqueou a tarefa. Usando inicializacao alternativa...\r
set "STARTUP_DIR=%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp"\r
copy /Y "%APP_DIR%\\launch.vbs" "%STARTUP_DIR%\\PedeAqui-Impressao.vbs" >nul 2>&1\r
start "" wscript.exe "%APP_DIR%\\launch.vbs"\r
:validate\r
echo [4/4] Iniciando...\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); do { Start-Sleep -Seconds 2; $process=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*PedeAqui\\PrintAgent\\src\\index.mjs*' } | Select-Object -First 1 } until ($process -or (Get-Date) -ge $deadline); if (-not $process) { exit 1 }; $headers=@{ Authorization='Bearer ${safeToken}' }; Invoke-RestMethod -Method Post -Uri '${safeUrl}/api/print-agent/config' -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 15 | Out-Null"\r
if errorlevel 1 goto :validation_error\r
echo.\r
echo ==============================================\r
echo PedeAqui Impressao conectado com sucesso.\r
echo Inicializacao automatica e watchdog validados.\r
echo Volte ao painel e atualize o status.\r
echo ==============================================\r
timeout /t 5 >nul\r
exit /b 0\r
:node_manual\r
echo.\r
echo Nao foi possivel instalar o componente automaticamente.\r
echo Instale o Node.js LTS e execute este arquivo novamente.\r
start "" "https://nodejs.org/"\r
pause\r
exit /b 1\r
:download_error\r
echo.\r
echo Nao foi possivel baixar o PedeAqui Impressao.\r
echo Confira a internet e execute este arquivo novamente.\r
pause\r
exit /b 1\r
:permission_error\r
echo.\r
echo O Windows bloqueou a gravacao dos arquivos do PedeAqui Impressao.\r
echo Feche o aplicativo, execute este instalador como administrador e tente novamente.\r
pause\r
exit /b 1\r
:validation_error\r
echo.\r
echo A instalacao foi criada, mas o agente ainda nao conseguiu se comunicar.\r
echo Confira a internet e use Reinstalar conexao no painel.\r
pause\r
exit /b 1\r
`;
}

