import Link from "next/link";
import type { PublicMenu } from "@/server/menu/schemas";
import styles from "./menu-browser.module.css";

type Product = PublicMenu["categories"][number]["products"][number];

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function PublicPromotionCard({
  product,
  storeSlug,
  showImage,
}: {
  product: Product;
  storeSlug: string;
  showImage: boolean;
}) {
  const promotionalPrice = product.promotional_price_cents ?? product.price_cents;
  const savings = Math.max(0, product.price_cents - promotionalPrice);
  const discountPercent = product.price_cents > 0
    ? Math.round((savings / product.price_cents) * 100)
    : 0;

  return (
    <Link
      href={`/m/${storeSlug}/produto/${product.id}`}
      className={styles.promotionCard}
      aria-label={`${product.name}, de ${money(product.price_cents)} por ${money(promotionalPrice)}`}
    >
      {showImage ? (
        product.image_url ? (
          // Catalog uploads are pre-sized WebP files; raw rendering preserves arbitrary legacy HTTPS URLs.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            width={220}
            height={112}
            loading="lazy"
            decoding="async"
            className={styles.promotionImage}
          />
        ) : (
          <div aria-hidden className={styles.promotionPlaceholder}>Sem foto</div>
        )
      ) : null}

      <div className={styles.promotionBody}>
        <div className={styles.promotionTopline}>
          <span className={styles.promotionBadge}>{product.promotion_label || "OFERTA"}</span>
          {discountPercent > 0 ? <span className={styles.promotionDiscount}>-{discountPercent}%</span> : null}
        </div>

        <strong className={styles.promotionTitle}>{product.name}</strong>
        {product.description ? <p className={styles.promotionDescription}>{product.description}</p> : null}

        <div className={styles.promotionPriceRow}>
          <span className={styles.promotionOldPrice}>{money(product.price_cents)}</span>
          <strong className={styles.promotionPrice}>{money(promotionalPrice)}</strong>
        </div>

        <span className={styles.promotionAction}>Ver produto</span>
      </div>
    </Link>
  );
}
