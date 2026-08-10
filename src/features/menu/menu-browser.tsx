"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicMenu } from "@/server/menu/schemas";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function MenuBrowser({ menu }: { menu: PublicMenu }) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return menu.categories
      .filter((category) => categoryId === "all" || category.id === categoryId)
      .map((category) => ({
        ...category,
        products: category.products.filter((product) => {
          if (!needle) return true;
          return normalize(`${product.name} ${product.description ?? ""}`).includes(needle);
        }),
      }))
      .filter((category) => category.products.length > 0);
  }, [menu.categories, query, categoryId]);

  const total = filtered.reduce((sum, category) => sum + category.products.length, 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {menu.settings.show_search ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Buscar no cardápio</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: X-Bacon, pizza, Coca-Cola..."
            type="search"
            style={{ width: "100%", minHeight: 48, padding: "12px 14px", borderRadius: 14, border: "1px solid #e9e3da", background: "#fff", color: "#181818" }}
          />
        </label>
      ) : null}

      {menu.settings.show_categories && menu.categories.length > 1 ? (
        <div role="tablist" aria-label="Categorias" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          <button type="button" onClick={() => setCategoryId("all")} aria-pressed={categoryId === "all"} style={pill(categoryId === "all", menu.settings.primary_color)}>Todos</button>
          {menu.categories.map((category) => (
            <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} aria-pressed={categoryId === category.id} style={pill(categoryId === category.id, menu.settings.primary_color)}>{category.name}</button>
          ))}
        </div>
      ) : null}

      {total === 0 ? (
        <div style={{ padding: 26, textAlign: "center", border: "1px solid #eee7df", borderRadius: 18, background: "#fff" }}>
          <strong>Nenhum item encontrado</strong>
          <p style={{ color: "#716b64", marginBottom: 0 }}>Tente outro termo ou categoria.</p>
        </div>
      ) : filtered.map((category) => (
        <section key={category.id} id={`categoria-${category.id}`} style={{ display: "grid", gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 21 }}>{category.name}</h2>
            {category.description ? <p style={{ color: "#716b64", margin: "4px 0 0" }}>{category.description}</p> : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
            {category.products.map((product) => {
              const price = product.promotional_price_cents ?? product.price_cents;
              return (
                <Link key={product.id} href={`/m/${menu.store.slug}/produto/${product.id}`} style={{ display: "grid", gridTemplateColumns: menu.settings.show_product_images ? "1fr 92px" : "1fr", gap: 12, padding: 14, background: "#fff", border: "1px solid #eee7df", borderRadius: 18, color: "#181818", minHeight: 118 }}>
                  <div style={{ display: "grid", alignContent: "space-between", gap: 8 }}>
                    <div>
                      <strong>{product.name}</strong>
                      {product.description ? <p style={{ color: "#716b64", fontSize: 13, margin: "4px 0 0", lineHeight: 1.35 }}>{product.description}</p> : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong style={{ color: menu.settings.primary_color }}>{money(price)}</strong>
                      {product.promotional_price_cents !== null ? <span style={{ color: "#8c857d", fontSize: 12, textDecoration: "line-through" }}>{money(product.price_cents)}</span> : null}
                      {product.availability === "sold_out" ? <span style={{ fontSize: 11, fontWeight: 800, color: "#b42318" }}>ESGOTADO</span> : null}
                    </div>
                  </div>
                  {menu.settings.show_product_images ? (
                    product.image_url ? <img src={product.image_url} alt="" width={92} height={92} loading="lazy" style={{ width: 92, height: 92, objectFit: "cover", borderRadius: 14 }} /> : <div aria-hidden style={{ width: 92, height: 92, borderRadius: 14, background: "#f4efe9", display: "grid", placeItems: "center", color: "#a49b91", fontWeight: 900 }}>P</div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function pill(active: boolean, accent: string): React.CSSProperties {
  return {
    border: active ? `1px solid ${accent}` : "1px solid #e5ded6",
    background: active ? accent : "#fff",
    color: active ? "#fff" : "#423d38",
    padding: "9px 13px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    fontWeight: 800,
    cursor: "pointer",
  };
}
