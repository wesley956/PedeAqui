"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicMenu } from "@/server/menu/schemas";
import styles from "./menu-browser.module.css";

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export function MenuBrowser({ menu }: { menu: PublicMenu }) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return menu.categories.filter((category) => categoryId === "all" || category.id === categoryId).map((category) => ({ ...category, products: category.products.filter((product) => !needle || normalize(`${product.name} ${product.description ?? ""}`).includes(needle)) })).filter((category) => category.products.length > 0);
  }, [menu.categories, query, categoryId]);
  const total = filtered.reduce((sum, category) => sum + category.products.length, 0);

  return <div className={styles.browser}>
    {menu.settings.show_search ? <label className={styles.search}><span className={styles.searchLabel}>Buscar no cardápio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: X-Bacon, pizza, Coca-Cola..." type="search" className={styles.searchInput} /></label> : null}
    {menu.settings.show_categories && menu.categories.length > 1 ? <div role="tablist" aria-label="Categorias" className={styles.categories}><button type="button" onClick={() => setCategoryId("all")} aria-pressed={categoryId === "all"} className={styles.categoryButton}>Todos</button>{menu.categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} aria-pressed={categoryId === category.id} className={styles.categoryButton}>{category.name}</button>)}</div> : null}
    {total === 0 ? <div className={`card ${styles.empty}`}><strong>Nenhum item encontrado</strong><p>Tente outro termo ou categoria.</p></div> : filtered.map((category) => <section key={category.id} id={`categoria-${category.id}`} className={styles.section}><div className={styles.sectionHeader}><h2>{category.name}</h2>{category.description ? <p>{category.description}</p> : null}</div><div className={styles.products}>{category.products.map((product) => {
      const price = product.promotional_price_cents ?? product.price_cents;
      return <Link key={product.id} href={`/m/${menu.store.slug}/produto/${product.id}`} className={`${styles.product} ${menu.settings.show_product_images ? "" : styles.productNoImage}`} aria-disabled={product.availability === "sold_out"}>
        <div className={styles.productCopy}><div><strong>{product.name}</strong>{product.description ? <p className={styles.description}>{product.description}</p> : null}</div><div className={styles.priceRow}><strong className={styles.price}>{money(price)}</strong>{product.promotional_price_cents !== null ? <span className={styles.oldPrice}>{money(product.price_cents)}</span> : null}{product.availability === "sold_out" ? <span className={styles.soldOut}>ESGOTADO</span> : null}</div></div>
        {menu.settings.show_product_images ? product.image_url ? <img src={product.image_url} alt="" width={92} height={92} loading="lazy" className={styles.image} /> : <div aria-hidden className={styles.placeholder}>•</div> : null}
      </Link>;
    })}</div></section>)}
  </div>;
}
