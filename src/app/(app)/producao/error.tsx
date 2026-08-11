"use client";

export default function ProductionError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section style={{ display: "grid", gap: 14, maxWidth: 720 }}>
      <div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>KDS · Produção</p>
        <h1 style={{ margin: "4px 0" }}>Não foi possível carregar a produção</h1>
      </div>
      <div className="card" style={{ padding: 20, display: "grid", gap: 10 }}>
        <p className="muted" style={{ margin: 0 }}>A conexão ou os dados da unidade falharam durante o carregamento.</p>
        <button type="button" onClick={reset} style={buttonStyle}>Tentar novamente</button>
      </div>
    </section>
  );
}

const buttonStyle: React.CSSProperties = {
  width: "fit-content",
  minHeight: 40,
  border: 0,
  borderRadius: 10,
  background: "var(--accent)",
  color: "#fff",
  padding: "8px 12px",
  fontWeight: 850,
  cursor: "pointer",
};
