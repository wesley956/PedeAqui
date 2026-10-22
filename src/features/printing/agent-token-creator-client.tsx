"use client";

import { useActionState, useId } from "react";
import { assistedInstaller } from "@/features/printing/assisted-installer";
import { Input } from "@/components/ui/form-controls";
import { useRouter } from "next/navigation";
import {
  createPrintAgentAction,
  reconnectPrintAgentAction,
  type AgentCreationState,
} from "@/features/printing/actions";

const initialState: AgentCreationState = { token: null, name: null, error: null, intentRevision: null };

function intentKey(prefix: string, intentSeed: string, revision: string | null) {
  return `${prefix}:${intentSeed}:${revision ?? "initial"}`;
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
    <div style={{ padding: 14, borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", gap: 10 }}>
      <strong>Computador preparado: {state.name}</strong>
      <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Baixe e execute o instalador abaixo neste computador. Ele conecta a impressora, ativa recuperação automática, atualização automática e reinicia o agente sozinho se ele parar.</span>
      <button type="button" onClick={() => downloadAssistedInstaller(state.token!)} style={buttonStyle}>Baixar instalador assistido (Windows)</button>
      <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>O Windows pode pedir confirmação para executar o arquivo. Depois, volte para esta tela e atualize o status.</span>
      <details>
        <summary style={{ cursor: "pointer", fontWeight: "var(--font-weight-bold)" }}>Configuração manual</summary>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Use esta chave somente se precisar configurar o aplicativo de impressão manualmente. Ela será mostrada uma única vez.</span>
          <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{state.token}</code>
        </div>
      </details>
    </div>
  );
}

export function AgentTokenCreatorClient({ intentSeed }: { intentSeed: string }) {
  const nameId = useId();
  const [state, action, pending] = useActionState(createPrintAgentAction, initialState);
  const idempotencyKey = intentKey("print-agent-create", intentSeed, state.intentRevision);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <Input id={nameId} name="name" label="Nome do computador" required minLength={2} maxLength={100} placeholder="Ex.: Computador do caixa" />
        <button type="submit" disabled={pending} style={buttonStyle}>{pending ? "Preparando…" : "Conectar este computador"}</button>
      </form>
      {state.error ? <div style={{ color: "var(--state-danger-text)", fontSize: "var(--font-size-support)" }}>{state.error}</div> : null}
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
      <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>
        {upgrade
          ? "Esta atualização é feita uma vez. Depois dela, o PedeAqui passa a recuperar travamentos e buscar novas versões do agente automaticamente."
          : "“Atualizar status” apenas consulta a situação atual. “Reinstalar conexão” gera uma nova chave e deve ser usado somente quando for necessário instalar ou reconectar este computador novamente."}
      </span>
      {state.error ? <div style={{ color: "var(--state-danger-text)", fontSize: "var(--font-size-support)" }}>{state.error}</div> : null}
      <InstallerCard state={state} />
    </div>
  );
}

const buttonStyle: React.CSSProperties = { minHeight: 44, border: 0, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "var(--text-on-brand)", fontWeight: "var(--font-weight-bold)", padding: "9px 13px", cursor: "pointer" };
const secondaryButtonStyle: React.CSSProperties = { minHeight: 44, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-2)", color: "var(--text)", fontWeight: "var(--font-weight-bold)", padding: "8px 11px", cursor: "pointer" };
