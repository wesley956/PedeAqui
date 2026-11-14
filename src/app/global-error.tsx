"use client";

import { useEffect } from "react";

/** Última barreira: falha na estrutura básica da página. Texto em português e sem depender do CSS do sistema. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[pedeaqui-ui-boundary] unexpected global error", { digest: error.digest ?? "unavailable" });
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: "#f6f4f0", color: "#1e2124" }}>
        <main style={{ width: "min(100%, 520px)", padding: 24, borderRadius: 16, background: "#ffffff", border: "1px solid #e7e2db" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Não foi possível abrir o PedeAqui</h1>
          <p style={{ margin: "0 0 16px", color: "#66615b", lineHeight: 1.5 }}>Houve uma falha passageira. Seus dados e pedidos continuam salvos. Tente de novo em alguns segundos.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 10, background: "#ff6b00", color: "#1a1a1a", font: "inherit", fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
        </main>
      </body>
    </html>
  );
}
