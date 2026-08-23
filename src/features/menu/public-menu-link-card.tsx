"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PublicMenuLinkCard({ url, storeName }: { url: string; storeName: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function openLink() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <article className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
      <div>
        <strong>Link público do cardápio</strong>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Compartilhe este endereço no WhatsApp, Instagram, Google e outros canais da {storeName}.
        </p>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Endereço do cardápio</span>
          <input
            aria-label="Endereço público do cardápio"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            style={{
              width: "100%",
              minHeight: 44,
              padding: "0 12px",
              borderRadius: "var(--radius-md)",
              border: "var(--border-width) solid var(--border-default)",
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              font: "inherit",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button type="button" onClick={copyLink}>{copied ? "Link copiado ✓" : "Copiar link"}</Button>
          <Button type="button" tone="secondary" onClick={openLink}>Abrir cardápio</Button>
        </div>
      </div>
    </article>
  );
}
