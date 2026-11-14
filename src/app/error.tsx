"use client";

import { useEffect } from "react";

/**
 * Falha fora das áreas que já têm tela de erro própria (por exemplo, ao montar o painel).
 * Sem este arquivo o Next mostra a tela padrão dele, em inglês.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[pedeaqui-ui-boundary] unexpected root error", { digest: error.digest ?? "unavailable" });
  }, [error]);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <article className="card" style={{ width: "min(100%, 520px)", padding: 24, display: "grid", gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--font-size-xl)" }}>Não foi possível abrir esta página</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Houve uma falha passageira no PedeAqui. Seus dados e pedidos continuam salvos. Tente de novo em alguns segundos.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: "var(--radius-md)", background: "var(--brand-primary)", color: "var(--text-on-brand)", font: "inherit", fontWeight: "var(--font-weight-bold)", cursor: "pointer" }}>Tentar novamente</button>
          {/* Navegação completa de propósito: recarrega o painel do zero depois da falha. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/dashboard" style={{ textDecoration: "underline" }}>Voltar ao início</a>
        </div>
      </article>
    </main>
  );
}
