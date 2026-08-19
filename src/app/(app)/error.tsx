"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AuthenticatedAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[pedeaqui-ui-boundary] unexpected authenticated-area error", {
      digest: error.digest ?? "unavailable",
    });
  }, [error]);

  return (
    <section style={{ padding: 24, display: "grid", placeItems: "center", minHeight: "50vh" }}>
      <article className="card" style={{ width: "min(100%, 620px)", padding: 24, display: "grid", gap: 14 }}>
        <div>
          <h1 style={{ margin: 0 }}>Não foi possível concluir esta operação</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            O PedeAqui encontrou uma falha inesperada. Tente novamente; se o problema continuar, retorne ao painel e refaça a operação.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Button type="button" onClick={reset}>Tentar novamente</Button>
          <Link href="/dashboard">Voltar ao painel</Link>
        </div>
      </article>
    </section>
  );
}
