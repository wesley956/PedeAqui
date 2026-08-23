import Link from "next/link";
import { cookies } from "next/headers";
import { cartCookieName } from "@/server/cart/cart-token";
import { PublicCartSummaryService } from "@/server/cart/public-cart-summary-service";
import styles from "./public-cart-bar.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export async function PublicCartBar({ storeSlug }: { storeSlug: string }) {
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

  return <>
    <div className={styles.spacer} aria-hidden />
    <div className={styles.viewport}>
      <Link
        href={`/m/${storeSlug}/carrinho`}
        className={styles.bar}
        aria-label={`Carrinho: ${itemLabel}, total atual ${total}. Ver carrinho`}
      >
        <span className={styles.summary}>
          <span className={styles.items}>🛒 {itemLabel}</span>
          <span className={styles.total}>{total}</span>
        </span>
        <span className={styles.action}>Ver carrinho →</span>
      </Link>
    </div>
  </>;
}
