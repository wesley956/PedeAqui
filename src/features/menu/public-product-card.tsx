import Link from "next/link";
import type { PublicMenu } from "@/server/menu/schemas";
import styles from "./menu-browser.module.css";

type Product = PublicMenu["categories"][number]["products"][number];
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export function PublicProductCard({ product, storeSlug, showImage, canOrder }: { product: Product; storeSlug: string; showImage: boolean; canOrder: boolean }) {
  const soldOut = product.availability === "sold_out";
  const unavailable = soldOut || !canOrder;
  const price = product.promotional_price_cents ?? product.price_cents;
  const hasPromotion = product.promotional_price_cents !== null && product.promotional_price_cents < product.price_cents;
  return <Link href={`/m/${storeSlug}/produto/${product.id}`} className={`${styles.product} ${showImage ? "" : styles.productNoImage} ${unavailable ? styles.productUnavailable : ""}`} aria-label={`${product.name}, ${soldOut ? "esgotado" : money(price)}`}>
    <div className={styles.productCopy}>
      <div className={styles.productText}><div className={styles.productTitleRow}><strong className={styles.productTitle}>{product.name}</strong>{soldOut ? <span className={styles.soldOut}>ESGOTADO</span> : hasPromotion ? <span className={styles.promo}>OFERTA</span> : null}</div>{product.description ? <p className={styles.description}>{product.description}</p> : null}</div>
      <div className={styles.priceRow}><strong className={styles.price}>{money(price)}</strong>{hasPromotion ? <span className={styles.oldPrice}>{money(product.price_cents)}</span> : null}{!unavailable ? <span className={styles.viewHint}>Escolher →</span> : <span className={styles.unavailableHint}>{soldOut ? "Indisponível para adicionar" : "Consulte agora; pedidos fechados"}</span>}</div>
    </div>
    {showImage ? product.image_url ? (
      // Catalog uploads are pre-sized WebP files; raw rendering preserves arbitrary legacy HTTPS URLs.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={product.image_url} alt="" width={108} height={108} loading="lazy" decoding="async" className={styles.image} />
    ) : <div aria-hidden className={styles.placeholder}><span>Sem foto</span></div> : null}
  </Link>;
}
