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

function intentKey(prefix: string, intentSeed: string, revision: string | null) {
  return `${prefix}:${intentSeed}:${revision ?? "initial"}`;
}

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function assistedInstaller(token: string, appUrl: string) {
  const tokenB64 = base64Utf8(token);
  const urlB64 = base64Utf8(appUrl.replace(/\/$/, ""));
  return `@echo off\r
setlocal EnableExtensions DisableDelayedExpansion\r
chcp 65001 >nul\r
title PedeAqui Impressao - Instalacao Profissional\r
fltmc >nul 2>&1 || (\r
  echo O Windows precisa autorizar esta instalacao uma unica vez.\r
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"\r
  exit /b\r
)\r
set "PEDEAQUI_INSTALL_TOKEN_B64=${tokenB64}"\r
set "PEDEAQUI_INSTALL_URL_B64=${urlB64}"\r
set "INSTALLER_PS1=%TEMP%\\PedeAqui-PrintAgent-Install.ps1"\r
echo.\r
echo ==============================================\r
echo    PedeAqui Impressao - Servico Windows\r
echo ==============================================\r
echo.\r
echo Preparando instalacao profissional...\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri '${RAW_ROOT}/windows/install-service.ps1' -OutFile $env:INSTALLER_PS1 -TimeoutSec 30"\r
if errorlevel 1 goto :download_error\r
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$env:PEDEAQUI_INSTALL_TOKEN=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:PEDEAQUI_INSTALL_TOKEN_B64)); $env:PEDEAQUI_INSTALL_URL=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:PEDEAQUI_INSTALL_URL_B64)); & $env:INSTALLER_PS1; exit $LASTEXITCODE"\r
if errorlevel 1 goto :install_error\r
set "PEDEAQUI_INSTALL_TOKEN_B64="\r
set "PEDEAQUI_INSTALL_URL_B64="\r
del /Q "%INSTALLER_PS1%" >nul 2>&1\r
echo.\r
echo ==============================================\r
echo PedeAqui Impressao conectado como servico.\r
echo O agente agora inicia pelo Windows sem login.\r
echo Volte ao painel e atualize o status.\r
echo ==============================================\r
timeout /t 5 >nul\r
exit /b 0\r
:download_error\r
echo.\r
echo Nao foi possivel baixar o instalador profissional.\r
echo Confira a internet e execute este arquivo novamente.\r
pause\r
exit /b 1\r
:install_error\r
echo.\r
echo A instalacao profissional nao foi concluida.\r
echo O instalador tentou preservar/restaurar a inicializacao anterior.\r
echo Nao apague a pasta do PedeAqui Impressao; ela contem o diagnostico e o spool.\r
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
      <span className="muted" style={{ fontSize: 13 }}>
        Baixe e execute o instalador neste computador. Ele instala o PedeAqui Impressão como serviço do Windows, preserva o spool e passa a iniciar sem depender de login.
      </span>
      <button type="button" onClick={() => downloadAssistedInstaller(state.token!)} style={buttonStyle}>Baixar instalador assistido (Windows)</button>
      <span className="muted" style={{ fontSize: 12 }}>
        O Windows pedirá autorização de administrador. A migração só remove a inicialização antiga depois que o novo serviço for validado.
      </span>
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
          <button type="submit" disabled={pending} style={secondaryButtonStyle}>{pending ? "Preparando…" : upgrade ? "Atualizar para serviço Windows" : "Reinstalar conexão"}</button>
        </form>
      </div>
      <span className="muted" style={{ fontSize: 12 }}>
        {upgrade
          ? "Esta migração substitui o watchdog provisório por um serviço do Windows com single-instance, recuperação e rollback de release."
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
