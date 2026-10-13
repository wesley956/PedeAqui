import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { addToCartAction } from "@/features/cart/actions";
import { ComplementCategorySection } from "@/features/menu/complement-category-section";
import { StoreOrderStatus } from "@/features/menu/store-order-status";
import { ModifierGroupSelector } from "@/features/menu/modifier-group-selector";
import { ProductImageFallback } from "@/features/menu/product-image-fallback";
import { ProductPurchaseBar } from "@/features/menu/product-purchase-bar";
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
  const modifierPrices = Object.fromEntries(product.modifier_groups.flatMap((group) => group.modifiers.map((modifier) => [modifier.id, modifier.price_cents])));
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

  return <main className={styles.root}>
    <form action={addToCartAction} className={styles.form}>
      <input type="hidden" name="storeSlug" value={store.slug} />
      <input type="hidden" name="productId" value={product.id} />
      {editItemId ? <input type="hidden" name="cartItemId" value={editItemId} /> : <input type="hidden" name="returnTo" value="menu" />}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Link className={styles.backLink} href={editItemId ? `/m/${store.slug}/carrinho` : `/m/${store.slug}`}>{editItemId ? "← Voltar ao carrinho" : `← Voltar para ${store.name}`}</Link>
      </div>

      {editItemId ? <div role="status" style={{ padding: 14, borderRadius: "var(--radius-lg)", background: "var(--state-warning-surface)", color: "var(--state-warning-text)", fontWeight: "var(--font-weight-bold)" }}>Editando este item. Se você voltar sem salvar, a montagem atual do carrinho permanece intacta.</div> : null}
      {errorMessage ? <div role="alert" style={{ padding: 14, borderRadius: "var(--radius-lg)", background: "var(--state-danger-surface)", color: "var(--state-danger-text)", fontWeight: "var(--font-weight-bold)" }}>{errorMessage}</div> : null}
      <StoreOrderStatus operational={operational} />

      <article className={styles.productCard}>
        {product.image_url ? (
          // Catalog uploads are pre-sized WebP files; raw rendering preserves arbitrary legacy HTTPS URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image_url} alt={product.name} width={720} height={360} fetchPriority="high" decoding="async" className={styles.productImage} />
        ) : <ProductImageFallback className={styles.productPlaceholder} />}
        <div className={styles.productInfo}>
          <div className={styles.productTop}>
            <div>
              <h1 className={styles.productTitle}>{product.name}</h1>
              {product.description ? <p className={styles.productDescription}>{product.description}</p> : null}
            </div>
            {soldOut ? <span style={{ background: "var(--state-danger-surface)", color: "var(--state-danger-text)", fontWeight: "var(--font-weight-bold)", borderRadius: "var(--radius-pill)", padding: "5px 8px", fontSize: "var(--font-size-xs)" }}>ESGOTADO</span> : null}
          </div>
          <div className={styles.priceRow}>
            <strong className={styles.productPrice}>{money(price)}</strong>
            {product.promotional_price_cents !== null ? <span className={styles.oldPrice}>{money(product.price_cents)}</span> : null}
          </div>
          {product.preparation_time_minutes > 0 ? <span className={styles.meta}>{timeLabel}: {product.preparation_time_minutes} min</span> : null}
        </div>
      </article>

      {gas ? <fieldset disabled={orderUnavailable} style={{ ...cardSurface, margin: 0, borderRadius: "var(--radius-lg)", padding: 18, display: "grid", gap: 12 }}>
        <legend style={{ fontWeight: "var(--font-weight-bold)", padding: "0 6px", color: "var(--text-primary)" }}>Como será o {gas.containerName.toLowerCase()}?</legend>
        <p style={{ margin: 0, color: "var(--text-secondary)" }}>Escolha a modalidade para {gas.containerCode}. Confira o valor da modalidade escolhida no carrinho.</p>
        {gas.exchangeEnabled ? <label style={{ display: "flex", gap: 10, alignItems: "start", padding: 12, border: "var(--border-width) solid var(--border-default)", borderRadius: "var(--radius-lg)", cursor: "pointer", color: "var(--text-primary)" }}><input type="radio" name="gasSaleMode" value="exchange" required={gas.requireContainerChoice} defaultChecked={editGasSaleMode === "exchange"} /><span><strong>Troca de vasilhame</strong><br /><small style={{ color: "var(--text-secondary)" }}>Você entrega um casco vazio compatível na entrega ou retirada.</small></span></label> : null}
        {gas.containerSaleEnabled ? <label style={{ display: "flex", gap: 10, alignItems: "start", padding: 12, border: "var(--border-width) solid var(--border-default)", borderRadius: "var(--radius-lg)", cursor: "pointer", color: "var(--text-primary)" }}><input type="radio" name="gasSaleMode" value="with_container" required={gas.requireContainerChoice} defaultChecked={editGasSaleMode === "with_container"} /><span><strong>Produto + vasilhame</strong><br /><small style={{ color: "var(--text-secondary)" }}>Inclui o casco. Acréscimo: {money(gas.containerSurchargeCents)}.</small></span></label> : null}
      </fieldset> : null}

      {product.modifier_groups.map((group, index) => <div key={group.id} className={styles.stepBlock} id={`grupo-${index + 1}`}>
        <ModifierGroupSelector group={group} disabled={orderUnavailable} complementTargetId={index === product.modifier_groups.length - 1 ? complementTargetId : undefined} initialSelections={initialSelections} />
      </div>)}

      {complements.length > 0 ? <div className={styles.stepBlock}>
        <ComplementCategorySection categories={complements} storeSlug={store.slug} businessType={businessType} disabled={orderUnavailable} />
      </div> : null}

      <section id="finalizar-item" className={styles.finalSection}>
        <label className={styles.noteField}>
          <strong>Alguma observação?</strong>
          <textarea name="note" maxLength={500} placeholder={notePlaceholder} defaultValue={editNote} disabled={orderUnavailable} className={styles.note} />
        </label>
      </section>

      <ProductPurchaseBar
        basePriceCents={price}
        modifierPrices={modifierPrices}
        initialQuantity={editQuantity}
        unavailable={orderUnavailable}
        label={soldOut ? `${productLabel} esgotado` : operational.label === "paused" ? "Pedidos pausados" : operational.label === "closed" ? "Cardápio fechado" : editItemId ? "Salvar alterações" : "Adicionar"}
      />
    </form>
  </main>;
}
