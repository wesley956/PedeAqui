"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { PublicMenu } from "@/server/menu/schemas";
import { PublicProductCard, type ProductOptions, type QuickLine } from "./public-product-card";
import styles from "./menu-browser.module.css";

type MenuBrowserData = Pick<PublicMenu, "categories"> & {
  store: Pick<PublicMenu["store"], "slug">;
  settings: Pick<PublicMenu["settings"], "show_search" | "show_categories" | "show_product_images">;
};

const PROMOTIONS_CATEGORY_ID = "00000000-0000-4000-8000-000000000999";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Cardápio Expresso: categorias presas no topo que levam até a seção (sem esconder as outras),
 * busca que filtra na hora e lista compacta com ação direta em cada item.
 */
export function MenuBrowser({ menu, canOrder, productOptions, quickLines = {}, allowQuickAdd = true }: {
  menu: MenuBrowserData;
  canOrder: boolean;
  productOptions?: Record<string, ProductOptions>;
  quickLines?: Record<string, QuickLine>;
  allowQuickAdd?: boolean;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoriesRef = useRef<HTMLDivElement | null>(null);
  const scrollLocked = useRef(false);

  const visibleCategories = useMemo(
    () => menu.categories.filter((category) => category.products.length > 0),
    [menu.categories],
  );

  const filtered = useMemo(() => {
    const needle = normalize(deferredQuery);
    return visibleCategories
      .map((category) => ({
        ...category,
        products: category.products.filter(
          (product) => !needle || normalize(`${product.name} ${product.description ?? ""}`).includes(needle),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [visibleCategories, deferredQuery]);

  // Expresso: promoções aparecem como uma seção da lista, com o mesmo botão de adicionar.
  const standardCategories = [...filtered].sort((a, b) => Number(b.id === PROMOTIONS_CATEGORY_ID) - Number(a.id === PROMOTIONS_CATEGORY_ID));
  const total = filtered.reduce((sum, category) => sum + category.products.length, 0);
  const catalogEmpty = visibleCategories.length === 0;
  const currentCategory = activeCategory ?? filtered[0]?.id ?? null;

  // Acompanha a rolagem e marca a categoria que está no topo da tela.
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-menu-section]"));
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (scrollLocked.current) return;
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const id = visible[0]?.target.getAttribute("data-menu-section");
      if (id) setActiveCategory(id);
    }, { rootMargin: "-72px 0px -60% 0px", threshold: 0 });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [filtered]);

  // Mantém o botão da categoria ativa visível na barra que rola de lado.
  useEffect(() => {
    if (!currentCategory || !categoriesRef.current) return;
    const button = categoriesRef.current.querySelector<HTMLElement>(`[data-category="${currentCategory}"]`);
    if (button) categoriesRef.current.scrollTo({ left: button.offsetLeft - 12, behavior: "smooth" });
  }, [currentCategory]);

  function goToCategory(id: string) {
    setActiveCategory(id);
    scrollLocked.current = true;
    window.setTimeout(() => { scrollLocked.current = false; }, 800);
    const target = document.getElementById(`categoria-${id}`);
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <div className={styles.browser}>
      {menu.settings.show_search ? (
        <label className={`${styles.search} ${styles.searchField}`}>
          <span className={styles.searchLabel}>Buscar no cardápio</span>
          <svg className={styles.searchIcon} aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pizza, lanche, bebida…"
            type="search"
            className={styles.searchInput}
          />
        </label>
      ) : null}

      {menu.settings.show_categories && filtered.length > 1 ? (
        <div role="group" aria-label="Categorias" ref={categoriesRef} className={styles.categories}>
          {filtered.map((category) => (
            <button
              key={category.id}
              type="button"
              data-category={category.id}
              onClick={() => goToCategory(category.id)}
              aria-pressed={currentCategory === category.id}
              className={styles.categoryButton}
            >
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      {total === 0 ? (
        <div className={`card ${styles.empty}`}>
          <strong>{catalogEmpty ? "Nenhum produto disponível no momento" : "Nenhum item encontrado"}</strong>
          <p>
            {catalogEmpty
              ? "O estabelecimento está preparando o cardápio. Tente novamente mais tarde."
              : "Tente outro nome ou limpe a busca."}
          </p>
        </div>
      ) : (
        <>
          {standardCategories.map((category) => (
            <section key={category.id} id={`categoria-${category.id}`} data-menu-section={category.id} className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>{category.name}</h2>
                {category.description ? <p>{category.description}</p> : null}
              </div>
              <div className={styles.products}>
                {category.products.map((product) => (
                  <PublicProductCard
                    key={product.id}
                    product={product}
                    storeSlug={menu.store.slug}
                    showImage={menu.settings.show_product_images}
                    canOrder={canOrder}
                    options={productOptions?.[product.id]}
                    quickLine={quickLines[product.id]}
                    allowQuickAdd={allowQuickAdd}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
