"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  createPrintAgentAction,
  reconnectPrintAgentAction,
  type AgentCreationState,
} from "@/features/printing/actions";

const initialState: AgentCreationState = { token: null, name: null, error: null, intentRevision: null };
const RAW_ROOT = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent";
const RAW_BASE = `${RAW_ROOT}/src`;

function intentKey(prefix: string, intentSeed: string, revision: string | null) {
  return `${prefix}:${intentSeed}:${revision ?? "initial"}`;
}

function assistedInstaller(token: string, appUrl: string) {
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
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/index.mjs' -OutFile '%DL_DIR%\\index.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/escpos.mjs' -OutFile '%DL_DIR%\\escpos.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/system-print.mjs' -OutFile '%DL_DIR%\\system-print.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/spool.mjs' -OutFile '%DL_DIR%\\spool.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/updater.mjs' -OutFile '%DL_DIR%\\updater.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_ROOT}/package.json' -OutFile '%DL_DIR%\\package.download'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_ROOT}/manifest.json' -OutFile '%DL_DIR%\\manifest.download'"\r
if errorlevel 1 goto :download_error\r
copy /Y "%DL_DIR%\\index.download" "%SRC_DIR%\\index.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\escpos.download" "%SRC_DIR%\\escpos.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\system-print.download" "%SRC_DIR%\\system-print.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\spool.download" "%SRC_DIR%\\spool.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\updater.download" "%SRC_DIR%\\updater.mjs" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\package.download" "%APP_DIR%\\package.json" >nul || goto :permission_error\r
copy /Y "%DL_DIR%\\manifest.download" "%APP_DIR%\\manifest.json" >nul || goto :permission_error\r
del /Q "%DL_DIR%\\*.download" >nul 2>&1\r
echo [3/4] Conectando com sua unidade...\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$needle=[IO.Path]::Combine($env:ProgramData,'PedeAqui','PrintAgent','src','index.mjs'); Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($needle) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1\r
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
icacls "%APP_DIR%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-19:(OI)(CI)M" /T /C >nul 2>&1\r
echo Criando inicializacao protegida junto com o Windows...\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $task='PedeAqui Impressao'; $action=New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('\"' + $env:ProgramData + '\\PedeAqui\\PrintAgent\\launch.vbs\"'); $trigger=New-ScheduledTaskTrigger -AtStartup; $settings=New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable; $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\LOCAL SERVICE' -LogonType ServiceAccount -RunLevel Limited; Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $task"\r
if errorlevel 1 goto :task_error\r
echo [4/4] Iniciando...\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $task=Get-ScheduledTask -TaskName 'PedeAqui Impressao'; if ($task.State -eq 'Disabled') { throw 'A tarefa foi criada, mas esta desativada.' }; $deadline=(Get-Date).AddSeconds(30); do { Start-Sleep -Seconds 2; $process=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*PedeAqui\\PrintAgent\\src\\index.mjs*' } | Select-Object -First 1 } until ($process -or (Get-Date) -ge $deadline); if (-not $process) { throw 'O agente nao iniciou dentro de 30 segundos.' }; $headers=@{ Authorization='Bearer ${safeToken}' }; Invoke-RestMethod -Method Post -Uri '${safeUrl}/api/print-agent/config' -Headers $headers -ContentType 'application/json' -Body '{}' -TimeoutSec 15 | Out-Null"\r
if errorlevel 1 goto :validation_error\r
echo.\r
echo ==============================================\r
echo PedeAqui Impressao conectado com sucesso.\r
echo Inicializacao no boot, recuperacao e watchdog validados.\r
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
:task_error\r
echo.\r
echo Nao foi possivel configurar a inicializacao com o Windows.\r
echo Execute novamente, aceite a autorizacao do Windows e tente de novo.\r
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

function downloadAssistedInstaller(token: string) {
  const content = assistedInstaller(token, window.location.origin);
  const blob = new Blob([content], { type: "application/x-msdos-program;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Instalar-PedeAqui-Impressao.cmd";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function InstallerCard({ state }: { state: AgentCreationState }) {
  if (!state.token) return null;
  return (
    <div style={{ padding: 14, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", gap: 10 }}>
      <strong>Computador preparado: {state.name}</strong>
      <span className="muted" style={{ fontSize: 13 }}>Baixe e execute o instalador abaixo neste computador. Ele conecta a impressora, ativa recuperação automática, atualização automática e reinicia o agente sozinho se ele parar.</span>
      <button type="button" onClick={() => downloadAssistedInstaller(state.token!)} style={buttonStyle}>Baixar instalador assistido (Windows)</button>
      <span className="muted" style={{ fontSize: 12 }}>O Windows pode pedir confirmação para executar o arquivo. Depois, volte para esta tela e atualize o status.</span>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 800 }}>Configuração manual</summary>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Use esta chave somente se precisar configurar o aplicativo de impressão manualmente. Ela será mostrada uma única vez.</span>
          <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{state.token}</code>
        </div>
      </details>
    </div>
  );
}

export function AgentTokenCreatorClient({ intentSeed }: { intentSeed: string }) {
  const [state, action, pending] = useActionState(createPrintAgentAction, initialState);
  const idempotencyKey = intentKey("print-agent-create", intentSeed, state.intentRevision);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input name="name" required minLength={2} maxLength={100} placeholder="Ex.: Computador do caixa" style={inputStyle} />
        <button type="submit" disabled={pending} style={buttonStyle}>{pending ? "Preparando…" : "Conectar este computador"}</button>
      </form>
      {state.error ? <div style={{ color: "#f97066", fontSize: 13 }}>{state.error}</div> : null}
      <InstallerCard state={state} />
    </div>
  );
}

export function AgentReconnectInstallerClient({ agentId, upgrade = false, intentSeed }: { agentId: string; upgrade?: boolean; intentSeed: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(reconnectPrintAgentAction, initialState);
  const idempotencyKey = intentKey(`print-agent-reconnect-${agentId}`, intentSeed, state.intentRevision);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => router.refresh()} style={secondaryButtonStyle}>Atualizar status</button>
        <form action={action}>
          <input type="hidden" name="agentId" value={agentId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <button type="submit" disabled={pending} style={secondaryButtonStyle}>{pending ? "Preparando…" : upgrade ? "Atualizar proteção automática" : "Reinstalar conexão"}</button>
        </form>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {upgrade
          ? "Esta atualização é feita uma vez. Depois dela, o PedeAqui passa a recuperar travamentos e buscar novas versões do agente automaticamente."
          : "“Atualizar status” apenas consulta a situação atual. “Reinstalar conexão” gera uma nova chave e deve ser usado somente quando for necessário instalar ou reconectar este computador novamente."}
      </span>
      {state.error ? <div style={{ color: "#f97066", fontSize: 13 }}>{state.error}</div> : null}
      <InstallerCard state={state} />
    </div>
  );
}

const inputStyle: React.CSSProperties = { minHeight: 42, flex: "1 1 220px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" };
const buttonStyle: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", fontWeight: 850, padding: "9px 13px", cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { minHeight: 38, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)", color: "var(--text)", fontWeight: 800, padding: "8px 11px", cursor: "pointer" };
