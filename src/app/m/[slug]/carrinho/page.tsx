import Link from "next/link";
import { cookies } from "next/headers";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { removeCartItemAction, updateCartQuantityAction } from "@/features/cart/actions";
import { CartService } from "@/server/cart/cart-service";
import { cartCookieName } from "@/server/cart/cart-token";
import styles from "./cart.module.css";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
const changeText = { price_changed: "O preço deste item mudou e foi atualizado.", unavailable: "Este item ficou indisponível e não entra mais no total.", invalid_modifiers: "As opções deste item mudaram. Remova-o e monte novamente." } as const;

const cartErrorMessages: Record<string, string> = {
  invalid_quantity: "Informe uma quantidade entre 1 e 99.",
  cart_update_failed: "Não foi possível atualizar a quantidade. Tente novamente.",
  cart_remove_failed: "Não foi possível remover o item. Tente novamente.",
};

export default async function PublicCartPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const token = (await cookies()).get(cartCookieName(slug))?.value;
  const result = await CartService.getCart(slug, token);
  const cart = result.cart;

  if (!cart || cart.items.length === 0) return <main className={styles.root}><div className={`${styles.container} ${styles.empty}`}><section className={`card ${styles.emptyCard}`}><div className={styles.emptyIcon} aria-hidden>0 itens</div><h1>Seu carrinho está vazio</h1><p className="muted">Escolha seus itens no cardápio para começar o pedido.</p><Link href={`/m/${slug}`} className={styles.emptyLink}>Ver cardápio</Link></section></div></main>;

  const invalidCount = cart.items.filter((item) => item.validation_status !== "valid").length;
  const discount = Number(cart.discount_cents ?? 0);
  const delivery = Number(cart.delivery_fee_cents ?? 0);

  return <main className={styles.root}><div className={styles.container}>
    <div className={styles.topbar}><Link href={`/m/${slug}`} className={styles.back}>← Continuar comprando</Link><PedeAquiLogo size="xs" decorative /></div>
    <header className={styles.header}><h1>Seu carrinho</h1><p className="muted">Preços, disponibilidade e benefícios são validados novamente no servidor sempre que o carrinho é aberto.</p></header>

    {query.erro ? <section role="alert" className={`card ${styles.changes}`}>{cartErrorMessages[query.erro] ?? "Não foi possível alterar o carrinho. Tente novamente."}</section> : null}

    {result.changes.length > 0 ? <section role="status" className={`card ${styles.changes}`}><strong>Atualizamos seu carrinho</strong>{result.changes.map((change) => <div key={`${change.itemId}-${change.kind}`} className={styles.change}><strong>{change.productName}:</strong> {changeText[change.kind]}</div>)}</section> : null}

    <div className={styles.items}>{cart.items.map((item) => {
      const invalid = item.validation_status !== "valid";
      return <article key={item.id} className={`card ${styles.item} ${invalid ? styles.itemInvalid : ""}`}>
        {item.product_image_url_snapshot ? <img src={item.product_image_url_snapshot} alt="" width={80} height={80} loading="lazy" decoding="async" className={styles.image} /> : <div className={styles.placeholder} aria-hidden>Sem foto</div>}
        <div className={styles.itemBody}>
          <div className={styles.itemTop}><div className={styles.itemIdentity}><span className={styles.itemName}>{item.product_name_snapshot}</span>{invalid ? <span className={styles.invalidLabel}>{item.validation_status === "unavailable" ? "INDISPONÍVEL" : "OPÇÕES ALTERADAS"}</span> : null}</div><span className={styles.itemPrice}>{money(Number(item.line_total_cents))}</span></div>
          {item.modifiers.length > 0 ? <div className={styles.meta}>{item.modifiers.map((modifier) => `${Number(modifier.quantity ?? 1) > 1 ? `${Number(modifier.quantity)}x ` : ""}${modifier.modifier_name_snapshot}${Number(modifier.unit_price_cents) > 0 ? ` (+ ${money(Number(modifier.unit_price_cents))}${Number(modifier.quantity ?? 1) > 1 ? " cada" : ""})` : ""}`).join(" · ")}</div> : null}
          {item.note ? <div className={styles.note}><strong>Observação:</strong> {item.note}</div> : null}
          <div className={styles.actions}>
            <form action={updateCartQuantityAction} className={styles.quantityForm}><input type="hidden" name="storeSlug" value={slug} /><input type="hidden" name="itemId" value={item.id} /><label className={styles.quantityLabel}>Quantidade<input type="number" name="quantity" min={1} max={99} defaultValue={item.quantity} className={styles.quantity} /></label><button type="submit" className={styles.secondaryButton}>Atualizar</button><Link href={`/m/${slug}/produto/${item.product_id}`} className={styles.rebuild}>Refazer opções/observação</Link></form>
            <form action={removeCartItemAction}><input type="hidden" name="storeSlug" value={slug} /><input type="hidden" name="itemId" value={item.id} /><button type="submit" className={styles.removeButton}>Remover</button></form>
          </div>
        </div>
      </article>;
    })}</div>

    <section className={`card ${styles.summary}`} aria-label="Resumo do pedido">
      <div className={styles.summaryRows}><div className={styles.row}><span>Subtotal dos itens válidos</span><strong>{money(Number(cart.subtotal_cents))}</strong></div>{discount > 0 ? <div className={`${styles.row} ${styles.discount}`}><span>Descontos e benefícios</span><strong>− {money(discount)}</strong></div> : null}{delivery > 0 ? <div className={styles.row}><span>Entrega</span><strong>{money(delivery)}</strong></div> : <div className={styles.row}><span>Entrega</span><strong>A calcular / sem taxa</strong></div>}</div>
      {(cart.coupon_code_snapshot || Number(cart.cashback_discount_cents) > 0 || Number(cart.loyalty_discount_cents) > 0) ? <div className={styles.benefits}>{cart.coupon_code_snapshot ? <span>Cupom aplicado: <strong>{cart.coupon_code_snapshot}</strong></span> : null}{Number(cart.cashback_discount_cents) > 0 ? <span>Cashback: − {money(Number(cart.cashback_discount_cents))}</span> : null}{Number(cart.loyalty_discount_cents) > 0 ? <span>Pontos: − {money(Number(cart.loyalty_discount_cents))}</span> : null}</div> : null}
      <div className={styles.divider} /><div className={`${styles.row} ${styles.total}`}><span>Total atual</span><strong>{money(Number(cart.total_cents))}</strong></div>
      {invalidCount > 0 ? <div className={styles.invalidAlert}>Remova ou refaça {invalidCount} item(ns) inválido(s) antes de continuar.</div> : <Link href={`/m/${slug}/checkout`} className={styles.checkout}>Continuar para identificação e entrega</Link>}
      <small className="muted">O total final é recalculado no checkout conforme endereço, entrega, pagamento e benefícios elegíveis.</small>
    </section>
  </div></main>;
}
