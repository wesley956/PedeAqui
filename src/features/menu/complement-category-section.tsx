"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { addSimpleComplementAction } from "@/features/menu/complement-actions";
import type { PublicComplementCategory } from "@/server/menu/complement-category-service";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function categoryTitle(name: string, businessType: string) {
  if (businessType !== "restaurant") return name;
  if (name.trim().toLocaleLowerCase("pt-BR") === "bebidas") return "Bebidas para acompanhar";
  return `${name} para acompanhar`;
}

export function ComplementCategorySection({ categories, storeSlug, businessType, disabled = false }: { categories: PublicComplementCategory[]; storeSlug: string; businessType: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  if (categories.length === 0) return null;
  function add(productId: string) {
    if (inFlight.current.has(productId)) return;
    inFlight.current.add(productId);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await addSimpleComplementAction(storeSlug, productId);
        setFeedback(result.message);
      } finally {
        inFlight.current.delete(productId);
      }
    });
  }
  return <section id="complementos" aria-labelledby="complementos-titulo" style={{ display: "grid", gap: 12, scrollMarginTop: 64, color: "var(--text-primary)" }}>
    <header style={{ display: "grid", gap: 3 }}><h2 id="complementos-titulo" style={{ margin: 0, fontSize: "1.125rem", lineHeight: 1.2 }}>Complete seu pedido</h2><p style={{ margin: 0, color: "var(--text-secondary)", fontSize: ".8125rem", lineHeight: 1.4 }}>Opcional. Você pode adicionar agora ou seguir sem complemento.</p></header>
    {feedback ? <div role="status" aria-live="polite" style={{ padding: 10, borderRadius: 12, background: "var(--state-success-surface)", color: "var(--state-success-text)", fontWeight: 700, fontSize: ".8125rem" }}>{feedback}</div> : null}
    {categories.map((category) => <article key={category.id} style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "var(--border-width) solid var(--border-default)", borderRadius: 16, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}><h3 style={{ margin: 0, fontSize: ".9375rem" }}>{categoryTitle(category.name, businessType)}</h3><Link href={`/m/${storeSlug}#categoria-${category.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-highlight)", fontWeight: 800, fontSize: ".75rem" }}>Ver todos ↗</Link></div>
      <div style={{ display: "grid", gap: 6 }}>{category.products.map((product) => {
        const price = product.promotionalPriceCents ?? product.priceCents;
        return <div key={product.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "9px 0", borderTop: "var(--border-width) solid var(--border-default)" }}>
          <div style={{ minWidth: 0 }}><strong style={{ display: "block", color: "var(--text-primary)", fontSize: ".875rem" }}>{product.name}</strong>{product.description ? <span style={{ display: "block", color: "var(--text-secondary)", fontSize: ".75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.description}</span> : null}<span style={{ display: "block", color: "var(--brand-primary)", fontWeight: 900, marginTop: 3, fontSize: ".9375rem" }}>{money(price)}</span></div>
          {product.requiresConfiguration ? <Link href={`/m/${storeSlug}/produto/${product.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Configurar ${product.name} em nova aba`} style={{ minHeight: 42, display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "8px 12px", border: "var(--border-width) solid var(--border-strong)", color: "var(--brand-highlight)", fontWeight: 900, fontSize: ".8125rem", textDecoration: "none" }}>Configurar ↗</Link> : <button type="button" onClick={() => add(product.id)} disabled={disabled || pending} aria-label={`Adicionar ${product.name}`} style={{ width: 44, minHeight: 44, borderRadius: 12, border: 0, background: disabled || pending ? "var(--surface-3)" : "var(--brand-primary)", color: disabled || pending ? "var(--text-secondary)" : "var(--text-on-brand)", fontSize: 24, fontWeight: 900, cursor: disabled || pending ? "not-allowed" : "pointer" }}>+</button>}
        </div>;
      })}</div>
    </article>)}
    <small style={{ color: "var(--text-secondary)", fontSize: ".71875rem" }}>Itens com opções obrigatórias abrem em nova aba para preservar a montagem atual.</small>
  </section>;
}
