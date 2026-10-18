"use client";

import Link from "next/link";
import { FallbackImage } from "@/components/ui/fallback-image";
import { useFormStatus } from "react-dom";
import { addToCartAction, removeCartItemAction, updateCartQuantityAction } from "@/features/cart/actions";
import type { PublicMenu } from "@/server/menu/schemas";
import { ProductImageFallback } from "./product-image-fallback";
import styles from "./menu-browser.module.css";

type Product = PublicMenu["categories"][number]["products"][number];
export type ProductOptions = { hasOptions: boolean; minimumRequiredExtraCents: number; priceVaries: boolean };
export type QuickLine = { itemId: string; quantity: number };

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

function PlusIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>; }
function MinusIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>; }

function PendingButton({ className, label, children }: { className?: string; label: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} aria-label={label} disabled={pending} aria-busy={pending || undefined}>{children}</button>;
}

function QuickForm({ action, storeSlug, productId, children, fields }: { action: (formData: FormData) => Promise<void>; storeSlug: string; productId: string; children: React.ReactNode; fields: Record<string, string> }) {
  return <form action={action} className={styles.quickForm}>
    <input type="hidden" name="storeSlug" value={storeSlug} />
    <input type="hidden" name="productId" value={productId} />
    <input type="hidden" name="returnTo" value="menu" />
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    {children}
  </form>;
}

/**
 * Linha do cardápio no formato Expresso: foto, nome, descrição curta, preço e uma ação direta.
 * Produto sem opções entra no carrinho pelo "+" e ajusta com − e + na própria lista.
 * Produto com opções abre a própria tela para montar.
 */
export function PublicProductCard({ product, storeSlug, showImage, canOrder, options, quickLine, allowQuickAdd = true }: {
  product: Product;
  storeSlug: string;
  showImage: boolean;
  canOrder: boolean;
  options?: ProductOptions;
  quickLine?: QuickLine;
  allowQuickAdd?: boolean;
}) {
  const soldOut = product.availability === "sold_out";
  const unavailable = soldOut || !canOrder;
  const price = product.promotional_price_cents ?? product.price_cents;
  const hasPromotion = product.promotional_price_cents !== null && product.promotional_price_cents < product.price_cents;
  // Sem o resumo de opções, o produto sempre abre a própria tela: nunca entra no carrinho incompleto.
  const hasOptions = options ? options.hasOptions : true;
  const fromPrice = options && options.hasOptions && (options.minimumRequiredExtraCents > 0 || options.priceVaries);
  const displayPrice = price + (options?.minimumRequiredExtraCents ?? 0);
  const quick = allowQuickAdd && !hasOptions && !unavailable;
  const href = `/m/${storeSlug}/produto/${product.id}`;
  const quantity = quickLine?.quantity ?? 0;

  let action: React.ReactNode;
  if (soldOut) action = <span className={styles.soldOut}>Esgotado</span>;
  else if (!canOrder) action = <span className={styles.unavailableHint}>Fechado agora</span>;
  else if (quick && quickLine && quantity > 0) {
    action = <div className={styles.quickStepper} role="group" aria-label={`Quantidade de ${product.name} no carrinho`}>
      {quantity > 1
        ? <QuickForm action={updateCartQuantityAction} storeSlug={storeSlug} productId={product.id} fields={{ itemId: quickLine.itemId, quantity: String(quantity - 1) }}><PendingButton className={styles.stepButton} label={`Tirar um ${product.name}`}><MinusIcon /></PendingButton></QuickForm>
        : <QuickForm action={removeCartItemAction} storeSlug={storeSlug} productId={product.id} fields={{ itemId: quickLine.itemId }}><PendingButton className={styles.stepButton} label={`Remover ${product.name} do carrinho`}><MinusIcon /></PendingButton></QuickForm>}
      <output className={styles.stepCount} aria-live="polite">{quantity}</output>
      <QuickForm action={updateCartQuantityAction} storeSlug={storeSlug} productId={product.id} fields={{ itemId: quickLine.itemId, quantity: String(Math.min(99, quantity + 1)) }}><PendingButton className={styles.stepButton} label={`Mais um ${product.name}`}><PlusIcon /></PendingButton></QuickForm>
    </div>;
  } else if (quick) {
    action = <QuickForm action={addToCartAction} storeSlug={storeSlug} productId={product.id} fields={{ quantity: "1" }}><PendingButton className={styles.addButton} label={`Adicionar ${product.name} ao carrinho`}><PlusIcon /></PendingButton></QuickForm>;
  } else {
    action = <Link href={href} scroll={false} className={styles.addButton} aria-label={`Escolher opções de ${product.name}`}><PlusIcon /></Link>;
  }

  return <article id={`produto-${product.id}`} className={`${styles.product} ${showImage ? "" : styles.productTextOnly} ${unavailable ? styles.productUnavailable : ""}`}>
    {showImage ? <Link href={href} scroll={false} className={styles.productMedia} tabIndex={-1} aria-hidden>
      {product.image_url
        // Catalog uploads are pre-sized WebP files; raw rendering preserves arbitrary legacy HTTPS URLs.
        ? <FallbackImage src={product.image_url} alt="" width={88} height={88} loading="lazy" decoding="async" className={styles.image} fallback={<ProductImageFallback className={styles.image} />} />
        : <ProductImageFallback className={styles.image} />}
    </Link> : null}
    <Link href={href} scroll={false} className={styles.productCopy} aria-label={`${product.name}, ${soldOut ? "esgotado" : `${fromPrice ? "a partir de " : ""}${money(displayPrice)}`}`}>
      <span className={styles.productTitleRow}>
        <strong className={styles.productTitle}>{product.name}</strong>
      </span>
      {product.description ? <span className={styles.description}>{product.description}</span> : null}
      <span className={styles.priceRow}>
        {fromPrice ? <span className={styles.fromLabel}>a partir de</span> : null}
        <strong className={styles.price}>{money(displayPrice)}</strong>
        {hasPromotion ? <span className={styles.oldPrice}>{money(product.price_cents + (options?.minimumRequiredExtraCents ?? 0))}</span> : null}
        {!soldOut && hasPromotion ? <span className={styles.promo}>{product.promotion_label || "Oferta"}</span> : null}
      </span>
    </Link>
    <div className={styles.productAction}>{action}</div>
  </article>;
}
