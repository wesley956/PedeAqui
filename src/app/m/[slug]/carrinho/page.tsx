import Link from "next/link";
import { cookies } from "next/headers";
import { removeCartItemAction, updateCartQuantityAction } from "@/features/cart/actions";
import { CartService } from "@/server/cart/cart-service";
import { cartCookieName } from "@/server/cart/cart-token";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const changeText = {
  price_changed: "O preço deste item mudou e foi atualizado.",
  unavailable: "Este item ficou indisponível e não entra mais no total.",
  invalid_modifiers: "As opções deste item mudaram. Remova-o e monte novamente.",
} as const;

export default async function PublicCartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = (await cookies()).get(cartCookieName(slug))?.value;
  const result = await CartService.getCart(slug, token);
  const cart = result.cart;

  if (!cart || cart.items.length === 0) {
    return (
      <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818", padding: "24px 12px" }}>
        <div style={{ width: "min(760px, 100%)", margin: "0 auto", display: "grid", gap: 18 }}>
          <Link href={`/m/${slug}`} style={{ color: "#6f675f", fontWeight: 700 }}>← Voltar ao cardápio</Link>
          <section style={{ padding: 32, textAlign: "center", background: "#fff", border: "1px solid #eee7df", borderRadius: 22 }}>
            <div style={{ width: 62, height: 62, margin: "0 auto 14px", borderRadius: 18, display: "grid", placeItems: "center", background: "#fff0e3", color: "#FF6B00", fontWeight: 950, fontSize: 28 }}>P</div>
            <h1 style={{ margin: 0 }}>Seu carrinho está vazio</h1>
            <p style={{ color: "#716b64" }}>Escolha seus itens no cardápio para começar o pedido.</p>
            <Link href={`/m/${slug}`} style={{ display: "inline-block", marginTop: 6, background: "#FF6B00", color: "#fff", padding: "12px 18px", borderRadius: 14, fontWeight: 900 }}>Ver cardápio</Link>
          </section>
        </div>
      </main>
    );
  }

  const invalidCount = cart.items.filter((item) => item.validation_status !== "valid").length;

  return (
    <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818", padding: "20px 12px 64px" }}>
      <div style={{ width: "min(760px, 100%)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <Link href={`/m/${slug}`} style={{ color: "#6f675f", fontWeight: 700 }}>← Continuar comprando</Link>
          <strong>Pede<span style={{ color: "#FF6B00" }}>Aqui</span></strong>
        </div>

        <header>
          <h1 style={{ margin: 0 }}>Seu carrinho</h1>
          <p style={{ color: "#716b64", margin: "5px 0 0" }}>Preços e disponibilidade são validados novamente sempre que o carrinho é aberto.</p>
        </header>

        {result.changes.length > 0 ? (
          <section role="status" style={{ display: "grid", gap: 8, padding: 14, borderRadius: 16, background: "#fff3e8", border: "1px solid #ffd6b8" }}>
            <strong>Atualizamos seu carrinho</strong>
            {result.changes.map((change) => <div key={`${change.itemId}-${change.kind}`} style={{ color: "#6f4a2f", fontSize: 13 }}><strong>{change.productName}:</strong> {changeText[change.kind]}</div>)}
          </section>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {cart.items.map((item) => {
            const invalid = item.validation_status !== "valid";
            return (
              <article key={item.id} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", gap: 14, padding: 14, background: "#fff", border: `1px solid ${invalid ? "#f5b7ae" : "#eee7df"}`, borderRadius: 18 }}>
                {item.product_image_url_snapshot ? <img src={item.product_image_url_snapshot} alt="" width={72} height={72} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 12 }} /> : <div aria-hidden style={{ width: 72, height: 72, borderRadius: 12, display: "grid", placeItems: "center", background: "#f4efe9", color: "#FF6B00", fontWeight: 950 }}>P</div>}
                <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>{item.product_name_snapshot}</strong>
                      {invalid ? <div style={{ color: "#b42318", fontSize: 12, fontWeight: 800, marginTop: 3 }}>{item.validation_status === "unavailable" ? "INDISPONÍVEL" : "OPÇÕES ALTERADAS"}</div> : null}
                    </div>
                    <strong>{money(Number(item.line_total_cents))}</strong>
                  </div>
                  {item.modifiers.length > 0 ? <div style={{ color: "#716b64", fontSize: 12 }}>{item.modifiers.map((modifier) => modifier.modifier_name_snapshot).join(" · ")}</div> : null}
                  {item.note ? <div style={{ color: "#716b64", fontSize: 12 }}>Obs.: {item.note}</div> : null}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                    <form action={updateCartQuantityAction} style={{ display: "flex", gap: 8, alignItems: "end" }}>
                      <input type="hidden" name="storeSlug" value={slug} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Quantidade<input type="number" name="quantity" min={1} max={99} defaultValue={item.quantity} style={{ width: 76, minHeight: 38, borderRadius: 10, border: "1px solid #e5ded6", padding: "7px 9px", background: "#fff", color: "#181818" }} /></label>
                      <button type="submit" style={{ minHeight: 38, border: "1px solid #e5ded6", background: "#fff", color: "#514b45", borderRadius: 10, padding: "7px 10px", fontWeight: 800 }}>Atualizar</button>
                    </form>
                    <form action={removeCartItemAction}>
                      <input type="hidden" name="storeSlug" value={slug} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" style={{ border: 0, background: "transparent", color: "#b42318", padding: 8, fontWeight: 800 }}>Remover</button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <section style={{ padding: 18, background: "#171717", color: "#fffdf9", borderRadius: 20, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Subtotal válido</span><strong>{money(Number(cart.subtotal_cents))}</strong></div>
          {Number(cart.delivery_fee_cents) > 0 ? <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span>Entrega</span><strong>{money(Number(cart.delivery_fee_cents))}</strong></div> : null}
          <div style={{ height: 1, background: "#353535" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 20 }}><strong>Total atual</strong><strong style={{ color: "#FF6B00" }}>{money(Number(cart.total_cents))}</strong></div>
          {invalidCount > 0 ? (
            <div style={{ padding: 12, borderRadius: 12, background: "#35211c", color: "#ffcfbf", fontSize: 13 }}>Remova ou refaça {invalidCount} item(ns) inválido(s) antes de continuar.</div>
          ) : (
            <Link href={`/m/${slug}/checkout`} style={{ display: "block", textAlign: "center", minHeight: 50, lineHeight: "50px", borderRadius: 14, background: "#FF6B00", color: "#fff", fontWeight: 950, fontSize: 16 }}>Ir para o checkout</Link>
          )}
        </section>
      </div>
    </main>
  );
}
