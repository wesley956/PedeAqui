"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Falha fora das áreas que já têm tela de erro própria (por exemplo, ao montar o painel).
 * Sem este arquivo o Next mostra a tela padrão dele, em inglês.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const menuPath = usePathname()?.match(/^\/m\/[^/]+/)?.[0];
  useEffect(() => {
    console.error("[pedeaqui-ui-boundary] unexpected root error", { digest: error.digest ?? "unavailable" });
  }, [error]);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <article className="card" style={{ width: "min(100%, 520px)", padding: 24, display: "grid", gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--font-size-xl)" }}>Não foi possível abrir esta página</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Não foi possível concluir esta ação. Tente novamente em alguns segundos. Se estava enviando um pedido, confira se ele foi recebido antes de repetir.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: "var(--radius-md)", background: "var(--brand-primary)", color: "var(--text-on-brand)", font: "inherit", fontWeight: "var(--font-weight-bold)", cursor: "pointer" }}>Tentar novamente</button>
          {/* Navegação completa para recuperar a área atual depois da falha. */}
          <a href={menuPath ?? "/dashboard"} style={{ textDecoration: "underline" }}>{menuPath ? "Voltar ao cardápio" : "Voltar ao início"}</a>
        </div>
      </article>
    </main>
  );
}
