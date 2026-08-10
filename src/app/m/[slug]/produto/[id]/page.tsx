import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicMenuService } from "@/server/menu/public-menu-service";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default async function PublicProductPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const result = await PublicMenuService.getProduct(slug, id);
  if (!result) notFound();

  const { product, store } = result;
  const price = product.promotional_price_cents ?? product.price_cents;

  return (
    <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818", padding: "18px 12px 64px" }}>
      <div style={{ width: "min(720px, 100%)", margin: "0 auto", display: "grid", gap: 16 }}>
        <Link href={`/m/${store.slug}`} style={{ color: "#6f675f", fontWeight: 700 }}>← Voltar para {store.name}</Link>

        <article style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 22, overflow: "hidden" }}>
          {product.image_url ? <img src={product.image_url} alt={product.name} width={720} height={360} style={{ display: "block", width: "100%", height: "min(42vw, 360px)", minHeight: 220, objectFit: "cover" }} /> : <div aria-hidden style={{ height: 220, background: "linear-gradient(135deg, #FF6B00, #171717)", display: "grid", placeItems: "center", color: "white", fontSize: 52, fontWeight: 950 }}>P</div>}
          <div style={{ padding: 20, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
              <div>
                <h1 style={{ margin: 0 }}>{product.name}</h1>
                {product.description ? <p style={{ color: "#716b64", lineHeight: 1.5 }}>{product.description}</p> : null}
              </div>
              {product.availability === "sold_out" ? <span style={{ background: "#fee4e2", color: "#b42318", fontWeight: 900, borderRadius: 999, padding: "6px 9px", fontSize: 11 }}>ESGOTADO</span> : null}
            </div>
            <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
              <strong style={{ color: "#FF6B00", fontSize: 24 }}>{money(price)}</strong>
              {product.promotional_price_cents !== null ? <span style={{ color: "#8c857d", textDecoration: "line-through" }}>{money(product.price_cents)}</span> : null}
            </div>
            {product.preparation_time_minutes > 0 ? <span style={{ color: "#716b64", fontSize: 13 }}>Preparo estimado: {product.preparation_time_minutes} min</span> : null}
          </div>
        </article>

        {product.modifier_groups.map((group) => (
          <section key={group.id} style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 18, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{group.name}</h2>
                {group.description ? <p style={{ color: "#716b64", margin: "5px 0 0" }}>{group.description}</p> : null}
              </div>
              <span style={{ color: "#8a837b", fontSize: 12, fontWeight: 800 }}>{group.required ? "OBRIGATÓRIO" : "OPCIONAL"}</span>
            </div>
            <p style={{ color: "#8a837b", fontSize: 12 }}>Escolha {group.min_selection === group.max_selection ? group.min_selection : `${group.min_selection} a ${group.max_selection}`}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {group.modifiers.map((modifier) => (
                <div key={modifier.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #f2ede7" }}>
                  <span>{modifier.name}</span>
                  <strong>{modifier.price_cents > 0 ? `+ ${money(modifier.price_cents)}` : "Incluso"}</strong>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div style={{ padding: 16, borderRadius: 18, background: product.availability === "sold_out" ? "#f3f0ec" : "#fff3e8", color: "#5a5148" }}>
          {product.availability === "sold_out" ? "Este produto está esgotado no momento." : "Seleção e carrinho entram no próximo bloco. Nesta etapa a página já expõe todas as opções válidas sem acessar dados internos do catálogo."}
        </div>
      </div>
    </main>
  );
}
