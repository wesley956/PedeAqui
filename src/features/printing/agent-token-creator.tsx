"use client";

import { useActionState } from "react";
import {
  createPrintAgentAction,
  reconnectPrintAgentAction,
  type AgentCreationState,
} from "@/features/printing/actions";

const initialState: AgentCreationState = { token: null, name: null, error: null };
const RAW_BASE = "https://raw.githubusercontent.com/wesley956/PedeAqui/main/print-agent/src";

function assistedInstaller(token: string, appUrl: string) {
  const safeToken = token.replaceAll("\"", "");
  const safeUrl = appUrl.replaceAll("\"", "").replace(/\/$/, "");
  return `@echo off\r
setlocal EnableExtensions\r
chcp 65001 >nul\r
title PedeAqui Impressao - Instalacao\r
set "APP_DIR=%LOCALAPPDATA%\\PedeAqui\\PrintAgent"\r
set "SRC_DIR=%APP_DIR%\\src"\r
echo.\r
echo ==============================================\r
echo       PedeAqui Impressao - Instalacao\r
echo ==============================================\r
echo.\r
echo [1/4] Preparando o computador...\r
if not exist "%SRC_DIR%" mkdir "%SRC_DIR%"\r
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
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/index.mjs' -OutFile '%SRC_DIR%\\index.mjs'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/escpos.mjs' -OutFile '%SRC_DIR%\\escpos.mjs'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/system-print.mjs' -OutFile '%SRC_DIR%\\system-print.mjs'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_BASE}/spool.mjs' -OutFile '%SRC_DIR%\\spool.mjs'"\r
if errorlevel 1 goto :download_error\r
echo [3/4] Conectando com sua unidade...\r
(\r
  echo @echo off\r
  echo set "PEDEAQUI_URL=${safeUrl}"\r
  echo set "PEDEAQUI_PRINT_AGENT_TOKEN=${safeToken}"\r
  echo "%NODE_EXE%" "%LOCALAPPDATA%\\PedeAqui\\PrintAgent\\src\\index.mjs"\r
) > "%APP_DIR%\\run.cmd"\r
(\r
  echo Set shell = CreateObject^("WScript.Shell"^)\r
  echo shell.Run Chr^(34^) ^& "%APP_DIR%\\run.cmd" ^& Chr^(34^), 0, False\r
) > "%APP_DIR%\\launch.vbs"\r
icacls "%APP_DIR%" /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" /T >nul 2>&1\r
set "STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"\r
copy /Y "%APP_DIR%\\launch.vbs" "%STARTUP%\\PedeAqui Impressao.vbs" >nul\r
echo [4/4] Iniciando...\r
wscript.exe "%APP_DIR%\\launch.vbs"\r
echo.\r
echo ==============================================\r
echo PedeAqui Impressao conectado com sucesso.\r
echo Volte ao painel e toque em Atualizar impressoras.\r
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
      <span className="muted" style={{ fontSize: 13 }}>Baixe e execute o instalador abaixo neste computador. Ele faz a conexão automaticamente e inicia junto com o Windows.</span>
      <button type="button" onClick={() => downloadAssistedInstaller(state.token!)} style={buttonStyle}>Baixar instalador assistido (Windows)</button>
      <span className="muted" style={{ fontSize: 12 }}>O Windows pode pedir confirmação para executar o arquivo. Depois, volte para esta tela e atualize a lista de impressoras.</span>
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

export function AgentTokenCreator() {
  const [state, action, pending] = useActionState(createPrintAgentAction, initialState);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="name" required minLength={2} maxLength={100} placeholder="Ex.: Computador do caixa" style={inputStyle} />
        <button type="submit" disabled={pending} style={buttonStyle}>{pending ? "Preparando…" : "Conectar este computador"}</button>
      </form>
      {state.error ? <div style={{ color: "#f97066", fontSize: 13 }}>{state.error}</div> : null}
      <InstallerCard state={state} />
    </div>
  );
}

export function AgentReconnectInstaller({ agentId }: { agentId: string }) {
  const [state, action, pending] = useActionState(reconnectPrintAgentAction, initialState);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <form action={action}>
        <input type="hidden" name="agentId" value={agentId} />
        <button type="submit" disabled={pending} style={secondaryButtonStyle}>{pending ? "Preparando…" : "Atualizar conexão"}</button>
      </form>
      {state.error ? <div style={{ color: "#f97066", fontSize: 13 }}>{state.error}</div> : null}
      <InstallerCard state={state} />
    </div>
  );
}

const inputStyle: React.CSSProperties = { minHeight: 42, flex: "1 1 220px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" };
const buttonStyle: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", fontWeight: 850, padding: "9px 13px", cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { minHeight: 38, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)", color: "var(--text)", fontWeight: 800, padding: "8px 11px", cursor: "pointer" };
