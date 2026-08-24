import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { addToCartAction } from "@/features/cart/actions";
import { PublicCartBar } from "@/features/cart/public-cart-bar";
import { ComplementCategorySection } from "@/features/menu/complement-category-section";
import { ModifierGroupSelector } from "@/features/menu/modifier-group-selector";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { CartService } from "@/server/cart/cart-service";
import { cartCookieName } from "@/server/cart/cart-token";
import { ComplementCategoryService, type PublicComplementCategory } from "@/server/menu/complement-category-service";
import { PublicMenuService } from "@/server/menu/public-menu-service";
import styles from "./public-product.module.css";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function validUuid(value?: string) { return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)); }

const cardSurface = {
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  border: "var(--border-width) solid var(--border-default)",
} as const;

const secondaryText = { color: "var(--text-secondary)" } as const;

export default async function PublicProductPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ erro?: string; editar?: string }> }) {
  const { slug, id } = await params;
  const query = await searchParams;
  const result = await PublicMenuService.getProduct(slug, id);
  if (!result) notFound();
  const { product, store, businessType, gas, operational } = result;
  const vocabulary = businessVocabulary(businessType);
  const productLabel = vocabulary.productSingular.charAt(0).toUpperCase() + vocabulary.productSingular.slice(1);
  const price = product.promotional_price_cents ?? product.price_cents;
  const soldOut = product.availability === "sold_out";
  const orderUnavailable = soldOut || !operational.canOrder;
  const timeLabel = businessType === "restaurant" ? "Preparo estimado" : businessType === "gas" ? "Separação estimada" : "Prazo estimado";
  const notePlaceholder = businessType === "restaurant" ? "Ex.: sem cebola, molho separado..." : businessType === "gas" ? "Ex.: tocar a campainha, referência da entrega..." : "Alguma observação para este item?";

  let editItemId: string | null = null;
  let editNote = "";
  let editQuantity = 1;
  let editGasSaleMode: "exchange" | "with_container" | null = null;
  const initialSelections: Record<string, number> = {};

  if (query.editar) {
    if (!validUuid(query.editar)) redirect(`/m/${store.slug}/carrinho?erro=cart_edit_failed`);
    const token = (await cookies()).get(cartCookieName(store.slug))?.value;
    if (!token) redirect(`/m/${store.slug}/carrinho?erro=cart_edit_failed`);
    const cartResult = await CartService.getCart(store.slug, token);
    const item = cartResult.cart?.items.find((candidate) => candidate.id === query.editar && candidate.product_id === product.id);
    if (!item) redirect(`/m/${store.slug}/carrinho?erro=cart_edit_failed`);
    editItemId = item.id;
    editNote = item.note ?? "";
    editQuantity = Number(item.quantity ?? 1);
    editGasSaleMode = item.gas?.sale_mode === "exchange" || item.gas?.sale_mode === "with_container" ? item.gas.sale_mode : null;
    for (const modifier of item.modifiers) initialSelections[modifier.modifier_id] = Number(modifier.quantity ?? 1);
  }

  let complements: PublicComplementCategory[] = [];
  try {
    complements = await ComplementCategoryService.loadPublic(store.slug, product.id);
  } catch {
    // Cross-sell is optional merchandising. Its failure must never block the main product flow.
    complements = [];
  }
  const complementTargetId = complements.length > 0 ? "complementos" : undefined;

  const errorMessage = query.erro === "store_unavailable" ? "A loja não está aceitando pedidos agora. Você ainda pode consultar o cardápio."
    : query.erro === "invalid_item" ? "Confira a quantidade, as opções e a observação antes de continuar."
    : query.erro === "cart_add_failed" ? "Não foi possível atualizar o carrinho agora. Tente novamente."
    : query.erro === "cart_edit_failed" ? "Não foi possível salvar as alterações. A versão anterior continua no carrinho."
    : query.erro === "product_unavailable" ? "Este produto ficou indisponível. A versão anterior permanece no carrinho até você removê-la ou tentar novamente."
    : query.erro === "invalid_modifiers" ? "As opções deste produto mudaram. Revise a montagem antes de salvar."
    : query.erro ? "Não foi possível atualizar o item. Revise as opções obrigatórias e tente novamente." : null;

  return <main className={styles.root} style={{ minHeight: "100vh", background: "var(--surface-0)", color: "var(--text-primary)", padding: "18px 12px 64px" }}>
    <form action={addToCartAction} style={{ width: "min(720px, 100%)", margin: "0 auto", display: "grid", gap: 16 }}>
      <input type="hidden" name="storeSlug" value={store.slug} />
      <input type="hidden" name="productId" value={product.id} />
      {editItemId ? <input type="hidden" name="cartItemId" value={editItemId} /> : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link href={editItemId ? `/m/${store.slug}/carrinho` : `/m/${store.slug}`} style={{ color: "var(--text-secondary)", fontWeight: 700 }}>{editItemId ? "← Voltar ao carrinho" : `← Voltar para ${store.name}`}</Link>
      </div>

      {editItemId ? <div role="status" style={{ padding: 14, borderRadius: 14, background: "var(--state-warning-surface)", color: "var(--state-warning-text)", fontWeight: 800 }}>Editando este item. Se você voltar sem salvar, a montagem atual do carrinho permanece intacta.</div> : null}
      {errorMessage ? <div role="alert" style={{ padding: 14, borderRadius: 14, background: "var(--state-danger-surface)", color: "var(--state-danger-text)", fontWeight: 700 }}>{errorMessage}</div> : null}
      {!operational.canOrder ? <div role="status" style={{ padding: 14, borderRadius: 14, background: "var(--state-warning-surface)", color: "var(--state-warning-text)", fontWeight: 700 }}>{operational.label === "paused" ? "Pedidos temporariamente pausados. O cardápio continua disponível para consulta." : "Cardápio fechado agora. Você pode consultar os produtos e voltar no horário de atendimento."}</div> : null}

      <article style={{ ...cardSurface, borderRadius: 22, overflow: "hidden" }}>
        {product.image_url ? (
          // Catalog uploads are pre-sized WebP files; raw rendering preserves arbitrary legacy HTTPS URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={product.name} width={720} height={360} fetchPriority="high" decoding="async" style={{ display: "block", width: "100%", height: "min(42vw, 360px)", minHeight: 220, objectFit: "cover" }} />
        ) : <div aria-hidden style={{ height: 220, background: "linear-gradient(135deg, var(--brand-primary), var(--brand-graphite-deep))", display: "grid", placeItems: "center", color: "var(--text-inverse)", fontSize: 52, fontWeight: 950 }}>P</div>}
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
            <div>
              <h1 style={{ margin: 0, color: "var(--text-primary)" }}>{product.name}</h1>
              {product.description ? <p style={{ ...secondaryText, lineHeight: 1.5 }}>{product.description}</p> : null}
            </div>
            {soldOut ? <span style={{ background: "var(--state-danger-surface)", color: "var(--state-danger-text)", fontWeight: 900, borderRadius: 999, padding: "6px 9px", fontSize: "0.6875em" }}>ESGOTADO</span> : null}
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "baseline" }}>
            <strong style={{ color: "var(--brand-primary)", fontSize: "1.5em" }}>{money(price)}</strong>
            {product.promotional_price_cents !== null ? <span style={{ color: "var(--text-secondary)", textDecoration: "line-through" }}>{money(product.price_cents)}</span> : null}
          </div>
          {product.preparation_time_minutes > 0 ? <span style={{ color: "var(--text-secondary)", fontSize: "0.8125em" }}>{timeLabel}: {product.preparation_time_minutes} min</span> : null}
        </div>
      </article>

      {gas ? <fieldset disabled={orderUnavailable} style={{ ...cardSurface, margin: 0, borderRadius: 18, padding: 18, display: "grid", gap: 12 }}>
        <legend style={{ fontWeight: 900, padding: "0 6px", color: "var(--text-primary)" }}>Como será o {gas.containerName.toLowerCase()}?</legend>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>Escolha a modalidade para {gas.containerCode}. O valor final será recalculado no servidor.</p>
        {gas.exchangeEnabled ? <label style={{ display: "flex", gap: 10, alignItems: "start", padding: 12, border: "var(--border-width) solid var(--border-default)", borderRadius: 14, cursor: "pointer", color: "var(--text-primary)" }}><input type="radio" name="gasSaleMode" value="exchange" required={gas.requireContainerChoice} defaultChecked={editGasSaleMode === "exchange"} /><span><strong>Troca de vasilhame</strong><br /><small style={{ color: "var(--text-secondary)" }}>Você entrega um casco vazio compatível na entrega ou retirada.</small></span></label> : null}
        {gas.containerSaleEnabled ? <label style={{ display: "flex", gap: 10, alignItems: "start", padding: 12, border: "var(--border-width) solid var(--border-default)", borderRadius: 14, cursor: "pointer", color: "var(--text-primary)" }}><input type="radio" name="gasSaleMode" value="with_container" required={gas.requireContainerChoice} defaultChecked={editGasSaleMode === "with_container"} /><span><strong>Produto + vasilhame</strong><br /><small style={{ color: "var(--text-secondary)" }}>Inclui o casco. Acréscimo: {money(gas.containerSurchargeCents)}.</small></span></label> : null}
      </fieldset> : null}

      {product.modifier_groups.map((group, index) => <ModifierGroupSelector key={group.id} group={group} disabled={orderUnavailable} complementTargetId={index === product.modifier_groups.length - 1 ? complementTargetId : undefined} initialSelections={initialSelections} />)}

      <ComplementCategorySection categories={complements} storeSlug={store.slug} businessType={businessType} disabled={orderUnavailable} />

      <section style={{ ...cardSurface, borderRadius: 18, padding: 18, display: "grid", gap: 14 }}>
        <label style={{ display: "grid", gap: 6, color: "var(--text-primary)" }}>
          <strong>Observação</strong>
          <textarea name="note" maxLength={500} placeholder={notePlaceholder} defaultValue={editNote} disabled={orderUnavailable} style={{ minHeight: 88, resize: "vertical", padding: 12, borderRadius: 12, border: "var(--border-width) solid var(--border-default)", background: "var(--surface-2)", color: "var(--text-primary)" }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0,1fr)", gap: 12, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6, color: "var(--text-primary)" }}>
            <strong>Quantidade</strong>
            <input name="quantity" type="number" min={1} max={99} defaultValue={editQuantity} required disabled={orderUnavailable} style={{ minHeight: 48, borderRadius: 12, border: "var(--border-width) solid var(--border-default)", padding: "10px 12px", background: "var(--surface-2)", color: "var(--text-primary)" }} />
          </label>
          <button type="submit" disabled={orderUnavailable} style={{ minHeight: 50, border: 0, borderRadius: 14, padding: "12px 18px", background: orderUnavailable ? "var(--surface-3)" : "var(--brand-primary)", color: orderUnavailable ? "var(--text-secondary)" : "var(--text-on-brand)", fontWeight: 900, cursor: orderUnavailable ? "not-allowed" : "pointer" }}>{soldOut ? `${productLabel} esgotado` : operational.label === "paused" ? "Pedidos pausados" : operational.label === "closed" ? "Cardápio fechado" : editItemId ? "Salvar alterações" : "Adicionar ao carrinho"}</button>
        </div>
        <small style={{ color: "var(--text-secondary)" }}>O valor exibido aqui é informativo. O PedeAqui recalcula produto e adicionais no servidor, incluindo opções do segmento quando existirem.</small>
      </section>
    </form>
    <PublicCartBar storeSlug={store.slug} />
  </main>;
}
