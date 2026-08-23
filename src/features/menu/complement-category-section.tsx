"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addSimpleComplementAction } from "@/features/menu/complement-actions";
import type { PublicComplementCategory } from "@/server/menu/complement-category-service";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function categoryTitle(name: string, businessType: string) {
  if (businessType !== "restaurant") return name;
  if (name.trim().toLocaleLowerCase("pt-BR") === "bebidas") return "Bebidas para acompanhar";
  return `${name} para acompanhar`;
}

export function ComplementCategorySection({
  categories,
  storeSlug,
  businessType,
  disabled = false,
}: {
  categories: PublicComplementCategory[];
  storeSlug: string;
  businessType: string;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  if (categories.length === 0) return null;

  function add(productId: string) {
    setFeedback(null);
    startTransition(async () => {
      const result = await addSimpleComplementAction(storeSlug, productId);
      setFeedback(result.message);
    });
  }

  return (
    <section id="complementos" aria-labelledby="complementos-titulo" style={{ display: "grid", gap: 16, scrollMarginTop: 20 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h2 id="complementos-titulo" style={{ margin: 0, fontSize: 22 }}>Complete seu pedido</h2>
        <p style={{ margin: 0, color: "#716b64" }}>Opcional. Você pode adicionar agora ou seguir sem complemento.</p>
      </header>

      {feedback ? <div role="status" aria-live="polite" style={{ padding: 12, borderRadius: 12, background: "#f3f7ef", color: "#315b23", fontWeight: 700 }}>{feedback}</div> : null}

      {categories.map((category) => (
        <article key={category.id} style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 18, padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{categoryTitle(category.name, businessType)}</h3>
            <Link href={`/m/${storeSlug}#categoria-${category.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "#9a4a00", fontWeight: 800, fontSize: 13 }}>Ver todos ↗</Link>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {category.products.map((product) => {
              const price = product.promotionalPriceCents ?? product.priceCents;
              return (
                <div key={product.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid #f0e9e1" }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block" }}>{product.name}</strong>
                    {product.description ? <span style={{ display: "block", color: "#716b64", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.description}</span> : null}
                    <span style={{ display: "block", color: "#9a4a00", fontWeight: 900, marginTop: 3 }}>{money(price)}</span>
                  </div>

                  {product.requiresConfiguration ? (
                    <Link
                      href={`/m/${storeSlug}/produto/${product.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Configurar ${product.name} em nova aba`}
                      style={{ minHeight: 42, display: "inline-flex", alignItems: "center", borderRadius: 12, padding: "8px 12px", border: "1px solid #f0c59f", color: "#9a4a00", fontWeight: 900, textDecoration: "none" }}
                    >Configurar ↗</Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => add(product.id)}
                      disabled={disabled || pending}
                      aria-label={`Adicionar ${product.name}`}
                      style={{ width: 44, minHeight: 44, borderRadius: 12, border: 0, background: disabled || pending ? "#ddd6cf" : "#FF6B00", color: disabled || pending ? "#756e67" : "#fff", fontSize: 24, fontWeight: 900, cursor: disabled || pending ? "not-allowed" : "pointer" }}
                    >+</button>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      ))}

      <small style={{ color: "#8a837b" }}>Itens com opções obrigatórias abrem em nova aba para preservar a montagem atual.</small>
    </section>
  );
}
