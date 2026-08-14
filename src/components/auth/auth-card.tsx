import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <section className="card" style={{ width: "min(100%, 420px)", padding: 24, display: "grid", gap: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div aria-hidden style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, var(--accent), var(--accent-strong))" }} />
            <strong style={{ fontSize: 20 }}>PedeAqui</strong>
          </div>
          <h1 style={{ margin: 0, fontSize: 26 }}>{title}</h1>
          <p className="muted" style={{ marginBottom: 0 }}>{subtitle}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
