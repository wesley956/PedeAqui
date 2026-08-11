"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { createDiningRoundAction, createQrRoundAction } from "@/features/dining/actions";
import {
  cartTotalCents,
  filterPosProducts,
  projectedUnitPriceCents,
  validateModifierSelection,
  type PosCartLine,
  type PosCategory,
  type PosProduct,
} from "@/features/pdv/model";
import type { DiningRoundInput } from "@/server/dining/schemas";
import styles from "@/features/pdv/pdv.module.css";

type Configurator = { productId: string; modifierIds: string[]; quantity: number; note: string; error: string | null };
type Props = { categories: PosCategory[]; products: PosProduct[]; tabId?: string; publicCode?: string; compact?: boolean };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (cents: number) => currency.format(cents / 100);

function selectedLabels(product: PosProduct, ids: readonly string[]) {
  const selected = new Set(ids); const labels: string[] = [];
  for (const group of product.modifierGroups) for (const modifier of group.modifiers) if (selected.has(modifier.id)) labels.push(modifier.name);
  return labels;
}

export function DiningRoundComposer({ categories, products, tabId, publicCode, compact = false }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [config, setConfig] = useState<Configurator | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const productIndex = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const visible = useMemo(() => filterPosProducts(products, categoryId, deferredSearch), [products, categoryId, deferredSearch]);
  const configProduct = config ? productIndex.get(config.productId) ?? null : null;
  const total = cartTotalCents(cart);

  function addLine(product: PosProduct, modifierIds: string[], quantity: number, note: string) {
    const validation = validateModifierSelection(product, modifierIds);
    if (!validation.valid) { setConfig((current) => current ? { ...current, error: validation.message } : current); return; }
    const sorted = [...modifierIds].sort(); const cleanNote = note.trim(); const key = `${product.id}|${sorted.join(",")}|${cleanNote}`;
    const unitPriceCents = projectedUnitPriceCents(product, sorted); const labels = selectedLabels(product, sorted);
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (!existing) return [...current, { key, productId: product.id, productName: product.name, quantity, note: cleanNote, modifierIds: sorted, modifierLabels: labels, unitPriceCents }];
      return current.map((line) => line.key === key ? { ...line, quantity: Math.min(999, line.quantity + quantity) } : line);
    });
    setConfig(null); setError(null); setSuccess(null);
  }

  function choose(product: PosProduct) {
    if (!product.modifierGroups.length) { addLine(product, [], 1, ""); return; }
    setConfig({ productId: product.id, modifierIds: [], quantity: 1, note: "", error: null });
  }

  async function sendRound() {
    if (!cart.length) { setError("Adicione pelo menos um item."); return; }
    const input: DiningRoundInput = { items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, note: line.note || null, modifierIds: line.modifierIds })) };
    const key = `dining:${crypto.randomUUID()}`;
    setPending(true); setError(null); setSuccess(null);
    try {
      const result = publicCode ? await createQrRoundAction(publicCode, input, key) : tabId ? await createDiningRoundAction(tabId, input, key) : { ok: false as const, round: null, error: "Destino da rodada inválido." };
      if (!result.ok || !result.round) { setError(result.error ?? "Não foi possível enviar a rodada."); return; }
      setSuccess(`Pedido #${result.round.display_number} enviado para a produção.`); setCart([]);
    } finally { setPending(false); }
  }

  return (
    <section className={styles.catalog} aria-label="Nova rodada">
      <div className={styles.toolbar}>
        <input className={styles.search} type="search" placeholder="Buscar produto..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className={styles.categories}>
          <button type="button" className={categoryId === null ? styles.categoryActive : styles.categoryButton} onClick={() => setCategoryId(null)}>Todos</button>
          {categories.map((category) => <button key={category.id} type="button" className={categoryId === category.id ? styles.categoryActive : styles.categoryButton} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}
        </div>
      </div>
      <div className={styles.productGrid} style={compact ? { gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" } : undefined}>
        {visible.map((product) => <button type="button" key={product.id} className={styles.productCard} onClick={() => choose(product)}><span><span className={styles.productName}>{product.name}</span>{product.description ? <span className={styles.productDescription}>{product.description}</span> : null}</span><span className={styles.productPrice}>{money(product.priceCents)}</span></button>)}
      </div>
      <div className={styles.section}>
        <div className={styles.rowBetween}><strong>Rodada</strong><strong className={styles.total}>{money(total)}</strong></div>
        {!cart.length ? <div className={styles.empty}>Selecione os itens consumidos nesta rodada.</div> : <div className={styles.cartList}>{cart.map((line) => <div key={line.key} className={styles.cartLine}><div className={styles.rowBetween}><strong>{line.quantity}× {line.productName}</strong><strong>{money(line.unitPriceCents * line.quantity)}</strong></div>{line.modifierLabels.length ? <span className={styles.mutedSmall}>{line.modifierLabels.join(" · ")}</span> : null}{line.note ? <span className={styles.mutedSmall}>Obs.: {line.note}</span> : null}<div className={styles.qtyRow}><button type="button" className={styles.smallButton} onClick={() => setCart((current) => current.flatMap((item) => item.key !== line.key ? [item] : item.quantity > 1 ? [{ ...item, quantity: item.quantity - 1 }] : []))}>−</button><strong>{line.quantity}</strong><button type="button" className={styles.smallButton} onClick={() => setCart((current) => current.map((item) => item.key === line.key ? { ...item, quantity: Math.min(999, item.quantity + 1) } : item))}>+</button><button type="button" className={styles.removeButton} onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>Remover</button></div></div>)}</div>}
        {error ? <div className={styles.statusError}>{error}</div> : null}{success ? <div className={styles.statusSuccess}>{success}</div> : null}
        <button type="button" className={styles.primaryButton} disabled={pending || !cart.length} onClick={sendRound}>{pending ? "Enviando..." : `Enviar para produção · ${money(total)}`}</button>
      </div>
      {config && configProduct ? <div className={styles.dialogBackdrop} role="presentation"><section className={styles.dialog} role="dialog" aria-modal="true"><div className={styles.rowBetween}><h2 style={{ margin: 0 }}>{configProduct.name}</h2><strong className={styles.productPrice}>{money(projectedUnitPriceCents(configProduct, config.modifierIds))}</strong></div>{configProduct.modifierGroups.map((group) => <div className={styles.group} key={group.id}><div className={styles.rowBetween}><strong>{group.name}</strong><span className={styles.mutedSmall}>{group.minSelection}–{group.maxSelection}{group.required ? " · obrigatório" : ""}</span></div>{group.modifiers.map((modifier) => { const checked = config.modifierIds.includes(modifier.id); return <label key={modifier.id} className={styles.modifierOption}><span className={styles.modifierLabel}><input type="checkbox" checked={checked} onChange={() => { const next = new Set(config.modifierIds); if (checked) next.delete(modifier.id); else { const selectedInGroup = group.modifiers.filter((item) => next.has(item.id)).length; if (selectedInGroup >= group.maxSelection) { setConfig({ ...config, error: `${group.name}: máximo de ${group.maxSelection}.` }); return; } next.add(modifier.id); } setConfig({ ...config, modifierIds: [...next], error: null }); }} />{modifier.name}</span><strong>{modifier.priceCents ? `+ ${money(modifier.priceCents)}` : "Incluso"}</strong></label>; })}</div>)}<textarea className={styles.field} rows={3} maxLength={500} value={config.note} placeholder="Observação" onChange={(event) => setConfig({ ...config, note: event.target.value, error: null })} /><div className={styles.rowBetween}><strong>Quantidade</strong><div className={styles.qtyRow}><button type="button" className={styles.smallButton} onClick={() => setConfig({ ...config, quantity: Math.max(1, config.quantity - 1) })}>−</button><strong>{config.quantity}</strong><button type="button" className={styles.smallButton} onClick={() => setConfig({ ...config, quantity: Math.min(999, config.quantity + 1) })}>+</button></div></div>{config.error ? <div className={styles.statusError}>{config.error}</div> : null}<div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={() => setConfig(null)}>Cancelar</button><button type="button" className={styles.primaryButton} onClick={() => addLine(configProduct, config.modifierIds, config.quantity, config.note)}>Adicionar</button></div></section></div> : null}
    </section>
  );
}
