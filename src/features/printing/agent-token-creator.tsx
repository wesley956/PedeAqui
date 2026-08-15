"use client";

import { useActionState } from "react";
import { createPrintAgentAction, type AgentCreationState } from "@/features/printing/actions";

const initialState: AgentCreationState = { token: null, name: null, error: null };

export function AgentTokenCreator() {
  const [state, action, pending] = useActionState(createPrintAgentAction, initialState);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="name" required minLength={2} maxLength={100} placeholder="Ex.: Computador do balcão" style={inputStyle} />
        <button type="submit" disabled={pending} style={buttonStyle}>{pending ? "Preparando…" : "Adicionar computador"}</button>
      </form>
      {state.error ? <div style={{ color: "#f97066", fontSize: 13 }}>{state.error}</div> : null}
      {state.token ? (
        <div style={{ padding: 12, borderRadius: 12, background: "#2d251d", border: "1px solid #684d31", display: "grid", gap: 6 }}>
          <strong>Chave de conexão de {state.name}</strong>
          <code style={{ overflowWrap: "anywhere", userSelect: "all" }}>{state.token}</code>
          <span className="muted" style={{ fontSize: 12 }}>Copie esta chave agora para conectar o computador. Por segurança, ela será mostrada somente uma vez.</span>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = { minHeight: 42, flex: "1 1 220px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px" };
const buttonStyle: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", fontWeight: 850, padding: "9px 13px" };
