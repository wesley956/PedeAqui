import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCartAction } from "@/features/cart/actions";
import { ModifierGroupSelector } from "@/features/menu/modifier-group-selector";
import { PublicMenuService } from "@/server/menu/public-menu-service";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export default async function PublicProductPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug, id } = await params;
  const query = await searchParams;
  const result = await PublicMenuService.getProduct(slug, id);
  if (!result) notFound();
  const { product, store } = result;
  const price = product.promotional_price_cents ?? product.price_cents;
  const soldOut = product.availability === "sold_out";

  return <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818", padding: "18px 12px 64px" }}>
    <form action={addToCartAction} style={{ width: "min(720px, 100%)", margin: "0 auto", display: "grid", gap: 16 }}>
      <input type="hidden" name="storeSlug" value={store.slug} /><input type="hidden" name="productId" value={product.id} />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><Link href={`/m/${store.slug}`} style={{ color: "#6f675f", fontWeight: 700 }}>← Voltar para {store.name}</Link><Link href={`/m/${store.slug}/carrinho`} style={{ color: "#FF6B00", fontWeight: 900 }}>Ver carrinho →</Link></div>
      {query.erro ? <div role="alert" style={{ padding: 14, borderRadius: 14, background: "#fee4e2", color: "#912018", fontWeight: 700 }}>Não foi possível adicionar o item. Revise as opções obrigatórias e tente novamente.</div> : null}
      <article style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 22, overflow: "hidden" }}>
        {product.image_url ? <img src={product.image_url} alt={product.name} width={720} height={360} fetchPriority="high" decoding="async" style={{ display: "block", width: "100%", height: "min(42vw, 360px)", minHeight: 220, objectFit: "cover" }} /> : <div aria-hidden style={{ height: 220, background: "linear-gradient(135deg, #FF6B00, #171717)", display: "grid", placeItems: "center", color: "white", fontSize: 52, fontWeight: 950 }}>P</div>}
        <div style={{ padding: 20, display: "grid", gap: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}><div><h1 style={{ margin: 0 }}>{product.name}</h1>{product.description ? <p style={{ color: "#716b64", lineHeight: 1.5 }}>{product.description}</p> : null}</div>{soldOut ? <span style={{ background: "#fee4e2", color: "#b42318", fontWeight: 900, borderRadius: 999, padding: "6px 9px", fontSize: 11 }}>ESGOTADO</span> : null}</div><div style={{ display: "flex", gap: 9, alignItems: "baseline" }}><strong style={{ color: "#FF6B00", fontSize: 24 }}>{money(price)}</strong>{product.promotional_price_cents !== null ? <span style={{ color: "#8c857d", textDecoration: "line-through" }}>{money(product.price_cents)}</span> : null}</div>{product.preparation_time_minutes > 0 ? <span style={{ color: "#716b64", fontSize: 13 }}>Preparo estimado: {product.preparation_time_minutes} min</span> : null}</div>
      </article>

      {product.modifier_groups.map((group) => <ModifierGroupSelector key={group.id} group={group} disabled={soldOut} />)}

      <section style={{ background: "#fff", border: "1px solid #eee7df", borderRadius: 18, padding: 18, display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6 }}><strong>Observação</strong><textarea name="note" maxLength={500} placeholder="Ex.: sem cebola, molho separado..." disabled={soldOut} style={{ minHeight: 88, resize: "vertical", padding: 12, borderRadius: 12, border: "1px solid #e5ded6", background: "#fff", color: "#181818" }} /></label>
        <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 12, alignItems: "end" }}><label style={{ display: "grid", gap: 6 }}><strong>Quantidade</strong><input name="quantity" type="number" min={1} max={99} defaultValue={1} required disabled={soldOut} style={{ minHeight: 48, borderRadius: 12, border: "1px solid #e5ded6", padding: "10px 12px", background: "#fff", color: "#181818" }} /></label><button type="submit" disabled={soldOut} style={{ minHeight: 50, border: 0, borderRadius: 14, padding: "12px 18px", background: soldOut ? "#d8d2cb" : "#FF6B00", color: soldOut ? "#756e67" : "#fff", fontWeight: 900, cursor: soldOut ? "not-allowed" : "pointer" }}>{soldOut ? "Produto esgotado" : "Adicionar ao carrinho"}</button></div>
        <small style={{ color: "#8a837b" }}>O valor exibido aqui é apenas informativo. O PedeAqui recalcula produto e adicionais no servidor antes de salvar o item.</small>
      </section>
    </form>
  </main>;
}
