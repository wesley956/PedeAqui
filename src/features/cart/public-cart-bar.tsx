import Link from "next/link";
import { cookies } from "next/headers";
import { cartCookieName } from "@/server/cart/cart-token";
import { PublicCartSummaryService } from "@/server/cart/public-cart-summary-service";
import { getPublicStoreBrand } from "@/server/menu/public-store-brand-service";
import styles from "./public-cart-bar.module.css";
import { NavigationIcon } from "@/components/ui/navigation-icon";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export async function PublicCartBar({ storeSlug, subtitle }: { storeSlug: string; subtitle?: string }) {
  const token = (await cookies()).get(cartCookieName(storeSlug))?.value;
  let summary = null;

  try {
    summary = await PublicCartSummaryService.get(storeSlug, token);
  } catch {
    // The cart shortcut is progressive enhancement. Public menu/product must stay usable if the summary read fails.
    return null;
  }

  if (!summary) return null;

  const itemLabel = summary.itemCount === 1 ? "1 item" : `${summary.itemCount} itens`;
  const total = money(summary.totalCents);
  const brand = await getPublicStoreBrand(storeSlug);
  const missingForMinimum = brand && brand.minimumOrderCents > summary.subtotalCents ? brand.minimumOrderCents - summary.subtotalCents : 0;

  return <>
    <div className={styles.spacer} aria-hidden />
    <div className={styles.viewport}>
      <Link
        href={`/m/${storeSlug}/checkout`}
        className={styles.bar}
        aria-label={`Carrinho: ${itemLabel}, total atual ${total}. Finalizar pedido`}
      >
        <span className={styles.count} aria-hidden>{summary.itemCount}</span>
        <span className={styles.summary}>
          <span className={styles.action}>Finalizar pedido</span>
          {missingForMinimum > 0
            ? <span className={styles.minimum}>Faltam {money(missingForMinimum)} para o pedido mínimo</span>
            : <span className={styles.items}>{subtitle ?? <><NavigationIcon name="cart" width={14} height={14} /> {itemLabel}</>}</span>}
        </span>
        <span className={styles.total}>{total}</span>
      </Link>
    </div>
  </>;
}
