@echo off
setlocal EnableExtensions
chcp 65001 >nul
title PedeAqui Impressao - Reparo de Inicializacao

fltmc >nul 2>&1 || (
  echo O Windows precisa autorizar este reparo uma unica vez.
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "APP_DIR=%ProgramData%\PedeAqui\PrintAgent"
set "LAUNCH=%APP_DIR%\launch.vbs"
set "RUN=%APP_DIR%\run.cmd"

echo.
echo ==============================================
echo   PedeAqui Impressao - Reparo de Inicializacao
echo ==============================================
echo.

if not exist "%RUN%" (
  echo ERRO: instalacao do PedeAqui Impressao nao foi encontrada.
  echo Volte ao painel e execute Reinstalar conexao primeiro.
  pause
  exit /b 1
)

if not exist "%LAUNCH%" (
  echo Set shell = CreateObject^("WScript.Shell"^) > "%LAUNCH%"
  echo shell.Run Chr^(34^) ^& "%RUN%" ^& Chr^(34^), 0, False >> "%LAUNCH%"
)

echo [1/3] Ajustando permissoes...
icacls "%APP_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-19:(OI)(CI)M" /T /C >nul 2>&1

echo [2/3] Recriando inicializacao automatica...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $task='PedeAqui Impressao'; $launch=[IO.Path]::Combine($env:ProgramData,'PedeAqui','PrintAgent','launch.vbs'); try { Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue } catch {}; $action=New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('\"' + $launch + '\"'); $trigger=New-ScheduledTaskTrigger -AtStartup; $settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable; $registered=$false; foreach($sid in @('S-1-5-19','S-1-5-18')) { try { $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType ServiceAccount -RunLevel Limited; Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null; $registered=$true; break } catch {} }; if(-not $registered){ throw 'Nao foi possivel registrar a tarefa com contas de servico por SID.' }; Start-ScheduledTask -TaskName $task"

if errorlevel 1 (
  echo Aviso: o Windows ainda bloqueou a tarefa agendada.
  echo Iniciando o agente diretamente para deixar a impressao funcionando agora...
  start "" wscript.exe "%LAUNCH%"
) else (
  echo Tarefa de inicializacao criada com sucesso.
)

echo [3/3] Validando o agente...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(30); do { Start-Sleep -Seconds 2; $process=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*PedeAqui\PrintAgent\src\index.mjs*' } | Select-Object -First 1 } until ($process -or (Get-Date) -ge $deadline); if(-not $process){ exit 1 }"

if errorlevel 1 (
  echo.
  echo O reparo foi aplicado, mas o agente ainda nao apareceu em 30 segundos.
  echo Feche esta janela, volte ao painel e use Reinstalar conexao.
  pause
  exit /b 1
)

echo.
echo ==============================================
echo REPARO CONCLUIDO COM SUCESSO
echo O PedeAqui Impressao esta em execucao.
echo Volte ao painel e clique em Atualizar status.
echo ==============================================
timeout /t 8 >nul
exit /b 0
