"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { createPdvSaleAction, searchPdvCustomersAction } from "@/features/pdv/actions";
import {
  cartTotalCents,
  filterPosProducts,
  formatMoneyInput,
  parsePosMoneyToCents,
  projectPosGrowth,
  projectedUnitPriceCents,
  validateModifierSelection,
  type PosCartLine,
  type PosCategory,
  type PosCoupon,
  type PosCustomer,
  type PosGrowthSettings,
  type PosPaymentMethod,
  type PosPaymentMethodOption,
  type PosProduct,
} from "@/features/pdv/model";
import type { PosSaleInput } from "@/server/pdv/schemas";
import styles from "@/features/pdv/pdv.module.css";

type PaymentDraft = { id: string; method: PosPaymentMethod; amountText: string; cashReceivedText: string; reference: string };
type ConfiguratorState = { productId: string; modifierIds: string[]; quantity: number; note: string; error: string | null };
type LastSale = { orderId: string; displayNumber: number; totalCents: number; changeDueCents: number };
type MobilePdvView = "catalog" | "sale";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function money(cents: number) { return currency.format(cents / 100); }

function modifierLabels(product: PosProduct, ids: readonly string[]) {
  const selected = new Set(ids); const labels: string[] = [];
  for (const group of product.modifierGroups) for (const modifier of group.modifiers) if (selected.has(modifier.id)) labels.push(modifier.name);
  return labels;
}

function paymentPayload(drafts: readonly PaymentDraft[], totalCents: number) {
  if (drafts.length === 0) return { ok: false as const, error: "Selecione uma forma de pagamento." };
  if (totalCents === 0) {
    const [hint] = drafts;
    if (!hint || drafts.length !== 1) return { ok: false as const, error: "Venda zerada deve manter apenas uma forma de pagamento como referência." };
    return { ok: true as const, value: [{ method: hint.method, amountCents: 0, cashReceivedCents: null, reference: null }] satisfies PosSaleInput["payments"] };
  }
  const lines: PosSaleInput["payments"] = [];
  let paymentTotal = 0;
  for (const draft of drafts) {
    const automaticTotal = drafts.length === 1 && !draft.amountText.trim();
    const amountCents = automaticTotal ? totalCents : parsePosMoneyToCents(draft.amountText);
    if (amountCents === null || amountCents <= 0) return { ok: false as const, error: "Informe o valor de cada parcela de pagamento." };
    let cashReceivedCents: number | null = null;
    if (draft.cashReceivedText.trim()) {
      cashReceivedCents = parsePosMoneyToCents(draft.cashReceivedText);
      if (cashReceivedCents === null) return { ok: false as const, error: "Valor recebido em dinheiro inválido." };
    }
    if (draft.method === "cash" && cashReceivedCents !== null && cashReceivedCents < amountCents) return { ok: false as const, error: "O valor recebido em dinheiro é menor que a parcela." };
    lines.push({ method: draft.method, amountCents, cashReceivedCents: draft.method === "cash" ? cashReceivedCents : null, reference: draft.reference.trim() || null });
    paymentTotal += amountCents;
  }
  if (!Number.isSafeInteger(paymentTotal) || paymentTotal !== totalCents) return { ok: false as const, error: `Os pagamentos somam ${money(paymentTotal)} e precisam fechar em ${money(totalCents)}.` };
  return { ok: true as const, value: lines };
}

function ProductConfigurator({ state, product, onChange, onCancel, onAdd }: { state: ConfiguratorState; product: PosProduct; onChange: (next: ConfiguratorState) => void; onCancel: () => void; onAdd: () => void }) {
  const unitPrice = projectedUnitPriceCents(product, state.modifierIds);
  function toggleModifier(groupId: string, modifierId: string) {
    const selected = new Set(state.modifierIds);
    if (selected.has(modifierId)) { selected.delete(modifierId); onChange({ ...state, modifierIds: [...selected], error: null }); return; }
    const group = product.modifierGroups.find((item) => item.id === groupId); if (!group) return;
    let selectedInGroup = 0; for (const modifier of group.modifiers) if (selected.has(modifier.id)) selectedInGroup += 1;
    if (selectedInGroup >= group.maxSelection) { onChange({ ...state, error: `${group.name}: máximo de ${group.maxSelection} seleção(ões).` }); return; }
    selected.add(modifierId); onChange({ ...state, modifierIds: [...selected], error: null });
  }
  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="pdv-config-title">
        <div className={styles.rowBetween}><div><div className={styles.mutedSmall}>CONFIGURAR ITEM</div><h2 id="pdv-config-title" style={{ margin: "3px 0 0" }}>{product.name}</h2></div><strong className={styles.productPrice}>{money(unitPrice)}</strong></div>
        {product.modifierGroups.map((group) => <div key={group.id} className={styles.group}>
          <div className={styles.rowBetween}><strong>{group.name}</strong><span className={styles.mutedSmall}>{group.minSelection === group.maxSelection ? `${group.minSelection} seleção(ões)` : `${group.minSelection}–${group.maxSelection} seleções`}{group.required ? " · obrigatório" : ""}</span></div>
          {group.modifiers.map((modifier) => { const checked = state.modifierIds.includes(modifier.id); return <label key={modifier.id} className={styles.modifierOption}><span className={styles.modifierLabel}><input type="checkbox" checked={checked} onChange={() => toggleModifier(group.id, modifier.id)} /><span>{modifier.name}</span></span><strong>{modifier.priceCents > 0 ? `+ ${money(modifier.priceCents)}` : "Incluso"}</strong></label>; })}
        </div>)}
        <label style={{ display: "grid", gap: 5 }}><strong style={{ fontSize: 13 }}>Observação</strong><textarea className={styles.field} value={state.note} maxLength={500} rows={3} placeholder="Ex.: sem cebola" onChange={(event) => onChange({ ...state, note: event.target.value, error: null })} /></label>
        <div className={styles.rowBetween}><strong>Quantidade</strong><div className={styles.qtyRow}><button type="button" className={styles.smallButton} onClick={() => onChange({ ...state, quantity: Math.max(1, state.quantity - 1) })}>−</button><strong>{state.quantity}</strong><button type="button" className={styles.smallButton} onClick={() => onChange({ ...state, quantity: Math.min(999, state.quantity + 1) })}>+</button></div></div>
        {state.error ? <div className={styles.statusError}>{state.error}</div> : null}
        <div className={styles.dialogActions}><button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancelar</button><button type="button" className={styles.primaryButton} onClick={onAdd}>Adicionar · {money(unitPrice * state.quantity)}</button></div>
      </section>
    </div>
  );
}

export function PosShell({ categories, products, customerSearchEnabled, paymentMethods, coupons, growthSettings, sessionNonce }: {
  categories: PosCategory[]; products: PosProduct[]; customerSearchEnabled: boolean; paymentMethods: PosPaymentMethodOption[];
  coupons: PosCoupon[]; growthSettings: PosGrowthSettings; sessionNonce: string;
}) {
  const defaultMethod = paymentMethods[0]?.method ?? "cash";
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobilePdvView>("catalog");
  const [search, setSearch] = useState(""); const deferredSearch = useDeferredValue(search);
  const [cart, setCart] = useState<PosCartLine[]>([]); const [configurator, setConfigurator] = useState<ConfiguratorState | null>(null);
  const [customerQuery, setCustomerQuery] = useState(""); const deferredCustomerQuery = useDeferredValue(customerQuery);
  const [customerMatches, setCustomerMatches] = useState<PosCustomer[]>([]);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [customerSearchPending, startCustomerSearch] = useTransition();
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [customerName, setCustomerName] = useState(""); const [customerPhone, setCustomerPhone] = useState(""); const [customerEmail, setCustomerEmail] = useState("");
  const [couponCode, setCouponCode] = useState(""); const [cashbackText, setCashbackText] = useState(""); const [loyaltyPointsText, setLoyaltyPointsText] = useState("");
  const [payments, setPayments] = useState<PaymentDraft[]>(() => [{ id: "payment-1", method: defaultMethod, amountText: "", cashReceivedText: "", reference: "" }]);
  const [revision, setRevision] = useState(0); const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [lastSale, setLastSale] = useState<LastSale | null>(null);

  const productIndex = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const visibleProducts = useMemo(() => filterPosProducts(products, categoryId, deferredSearch), [products, categoryId, deferredSearch]);
  useEffect(() => {
    if (!customerSearchEnabled || selectedCustomer || deferredCustomerQuery.trim().length < 2) return;
    const timer = window.setTimeout(() => startCustomerSearch(async () => {
      const result = await searchPdvCustomersAction(deferredCustomerQuery);
      setCustomerMatches(result.customers);
      setCustomerSearchError(result.error);
    }), 250);
    return () => window.clearTimeout(timer);
  }, [customerSearchEnabled, deferredCustomerQuery, selectedCustomer]);
  const cartSubtotal = cartTotalCents(cart);
  const cashbackParsed = cashbackText.trim() ? parsePosMoneyToCents(cashbackText) : 0;
  const loyaltyNumber = loyaltyPointsText.trim() ? Number(loyaltyPointsText) : 0;
  const growthProjection = useMemo(() => projectPosGrowth({
    subtotalCents: cartSubtotal, couponCode, coupons, customer: selectedCustomer, settings: growthSettings,
    cashbackRedeemCents: cashbackParsed === null ? -1 : cashbackParsed,
    loyaltyRedeemPoints: Number.isInteger(loyaltyNumber) && loyaltyNumber >= 0 ? loyaltyNumber : -1,
  }), [cartSubtotal, couponCode, coupons, selectedCustomer, growthSettings, cashbackParsed, loyaltyNumber]);
  const saleTotal = growthProjection.valid ? growthProjection.totalCents : cartSubtotal;
  const cartItemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const configProduct = configurator ? productIndex.get(configurator.productId) ?? null : null;

  function touchSale() { setRevision((value) => value + 1); setError(null); setLastSale(null); }
  function changeBenefit(setter: (value: string) => void, value: string) { setter(value); touchSale(); }
  function addCartLine(product: PosProduct, modifierIds: string[], quantity: number, note: string) {
    const validation = validateModifierSelection(product, modifierIds);
    if (!validation.valid) { setConfigurator((current) => current ? { ...current, error: validation.message } : current); return; }
    const sortedIds = [...modifierIds].sort(); const cleanNote = note.trim(); const key = `${product.id}|${sortedIds.join(",")}|${cleanNote}`;
    const unitPriceCents = projectedUnitPriceCents(product, sortedIds); const labels = modifierLabels(product, sortedIds);
    setCart((current) => { const existing = current.find((line) => line.key === key); if (!existing) return [...current, { key, productId: product.id, productName: product.name, quantity, note: cleanNote, modifierIds: sortedIds, modifierLabels: labels, unitPriceCents }]; return current.map((line) => line.key === key ? { ...line, quantity: Math.min(999, line.quantity + quantity) } : line); });
    touchSale(); setConfigurator(null);
  }
  function chooseProduct(product: PosProduct) { if (product.modifierGroups.length === 0) { addCartLine(product, [], 1, ""); return; } setConfigurator({ productId: product.id, modifierIds: [], quantity: 1, note: "", error: null }); }
  function changeQuantity(key: string, delta: number) { setCart((current) => current.flatMap((line) => { if (line.key !== key) return [line]; const quantity = line.quantity + delta; return quantity > 0 ? [{ ...line, quantity: Math.min(999, quantity) }] : []; })); touchSale(); }
  function removeLine(key: string) { setCart((current) => current.filter((line) => line.key !== key)); touchSale(); }
  function selectCustomer(customer: PosCustomer | null) { setSelectedCustomer(customer); setCustomerMatches([]); setCustomerQuery(customer ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}` : ""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setCashbackText(""); setLoyaltyPointsText(""); touchSale(); }
  function changeManualCustomer(field: "name" | "phone" | "email", value: string) { setSelectedCustomer(null); setCashbackText(""); setLoyaltyPointsText(""); if (field === "name") setCustomerName(value); if (field === "phone") setCustomerPhone(value); if (field === "email") setCustomerEmail(value); touchSale(); }
  function updatePayment(id: string, patch: Partial<PaymentDraft>) { setPayments((current) => current.map((payment) => payment.id === id ? { ...payment, ...patch } : payment)); touchSale(); }
  function addPayment() { setPayments((current) => { const prepared = current.length === 1 && !current[0]?.amountText.trim() ? current.map((payment) => ({ ...payment, amountText: formatMoneyInput(saleTotal) })) : current; return [...prepared, { id: crypto.randomUUID(), method: defaultMethod, amountText: "", cashReceivedText: "", reference: "" }]; }); touchSale(); }
  function removePayment(id: string) { setPayments((current) => { const remaining = current.filter((payment) => payment.id !== id); const [onlyPayment] = remaining; if (remaining.length === 1 && onlyPayment) return [{ ...onlyPayment, amountText: "" }]; return remaining; }); touchSale(); }

  async function finalizeSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setLastSale(null);
    if (cart.length === 0) { setError("Adicione pelo menos um item ao carrinho."); return; }
    if (paymentMethods.length === 0) { setError("Nenhuma forma de pagamento está habilitada para esta unidade."); return; }
    if (!selectedCustomer && customerPhone.trim() && customerName.trim().length < 2) { setError("Informe o nome do cliente para cadastrar o telefone."); return; }
    if (!growthProjection.valid) { setError(growthProjection.message); return; }
    const resolvedPayments = paymentPayload(payments, growthProjection.totalCents); if (!resolvedPayments.ok) { setError(resolvedPayments.error); return; }
    const customer: PosSaleInput["customer"] = selectedCustomer ? { id: selectedCustomer.id } : (customerName.trim() || customerPhone.trim() || customerEmail.trim()) ? { name: customerName.trim() || null, phone: customerPhone.trim() || null, email: customerEmail.trim() || null } : null;
    const input: PosSaleInput = { items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, note: line.note, modifierIds: line.modifierIds })), payments: resolvedPayments.value, customer, growth: { couponCode: couponCode.trim() || null, cashbackRedeemCents: cashbackParsed ?? 0, loyaltyRedeemPoints: loyaltyNumber } };
    setPending(true);
    try {
      const result = await createPdvSaleAction(input, `${sessionNonce}:${revision}`);
      if (!result.ok || !result.sale) { setError(result.error ?? "Não foi possível finalizar a venda."); return; }
      setLastSale(result.sale); setCart([]); setSelectedCustomer(null); setCustomerQuery(""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setCouponCode(""); setCashbackText(""); setLoyaltyPointsText("");
      setPayments([{ id: crypto.randomUUID(), method: defaultMethod, amountText: "", cashReceivedText: "", reference: "" }]); setRevision((value) => value + 1);
    } finally { setPending(false); }
  }

  return (
    <section className={styles.shell}>
      <header className={styles.header}><div><p className="muted">Venda presencial · preços e benefícios revalidados no servidor</p><h1>PDV</h1></div><div className={styles.mutedSmall}>Selecione itens, confira a venda e finalize.</div></header>
      {lastSale ? <div className={styles.statusSuccess}>Venda <strong>#{lastSale.displayNumber}</strong> finalizada em {money(lastSale.totalCents)}.{lastSale.changeDueCents > 0 ? <> Troco: <strong>{money(lastSale.changeDueCents)}</strong>.</> : null}{" "}<Link href={`/pedidos/${lastSale.orderId}`}>Abrir pedido</Link></div> : null}
      {error ? <div className={styles.statusError}>{error}</div> : null}

      <nav className={styles.mobileViewSwitcher} aria-label="Etapa atual da venda">
        <button
          type="button"
          className={mobileView === "catalog" ? styles.mobileViewActive : styles.mobileViewButton}
          aria-current={mobileView === "catalog" ? "page" : undefined}
          onClick={() => setMobileView("catalog")}
        >
          Itens
        </button>
        <button
          type="button"
          className={mobileView === "sale" ? styles.mobileViewActive : styles.mobileViewButton}
          aria-current={mobileView === "sale" ? "page" : undefined}
          onClick={() => setMobileView("sale")}
        >
          Venda · {cartItemCount} {cartItemCount === 1 ? "item" : "itens"} · {money(saleTotal)}
        </button>
      </nav>

      <div className={styles.layout} data-mobile-view={mobileView}>
        <div className={styles.catalog} data-pdv-panel="catalog">
          <div className={styles.toolbar}><input className={styles.search} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, SKU ou código de barras" autoComplete="off" aria-label="Buscar produtos no PDV" /><div className={styles.categories} aria-label="Categorias do PDV"><button type="button" className={categoryId === null ? styles.categoryActive : styles.categoryButton} onClick={() => setCategoryId(null)}>Todos</button>{categories.map((category) => <button type="button" key={category.id} className={categoryId === category.id ? styles.categoryActive : styles.categoryButton} onClick={() => setCategoryId(category.id)}>{category.name}</button>)}</div></div>
          {visibleProducts.length === 0 ? <div className={styles.empty}>Nenhum produto disponível para este filtro.</div> : <div className={styles.productGrid}>{visibleProducts.map((product) => <button type="button" key={product.id} className={styles.productCard} onClick={() => chooseProduct(product)}><span><span className={styles.productName}>{product.name}</span>{product.description ? <span className={styles.productDescription}>{product.description}</span> : null}</span><span className={styles.rowBetween}><span className={styles.productPrice}>{money(product.priceCents)}</span><span className={styles.mutedSmall}>{product.modifierGroups.length > 0 ? "Configurar" : "+ Adicionar"}</span></span></button>)}</div>}
        </div>

        <form className={`card ${styles.cartPanel}`} data-pdv-panel="sale" onSubmit={finalizeSale}>
          <div className={styles.cartHeader}><div><div className={styles.mutedSmall}>VENDA ATUAL</div><h2 style={{ margin: "3px 0 0", fontSize: 19 }}>Carrinho</h2></div><strong>{cartItemCount} {cartItemCount === 1 ? "item" : "itens"}</strong></div>
          {cart.length === 0 ? <div className={styles.empty}>Selecione produtos para iniciar a venda.</div> : <div className={styles.cartList}>{cart.map((line) => <div key={line.key} className={styles.cartLine}><div className={styles.rowBetween}><strong>{line.productName}</strong><strong>{money(line.unitPriceCents * line.quantity)}</strong></div>{line.modifierLabels.length > 0 ? <div className={styles.mutedSmall}>{line.modifierLabels.join(" · ")}</div> : null}{line.note ? <div className={styles.mutedSmall}>Obs.: {line.note}</div> : null}<div className={styles.rowBetween}><div className={styles.qtyRow}><button type="button" className={styles.smallButton} onClick={() => changeQuantity(line.key, -1)}>−</button><strong>{line.quantity}</strong><button type="button" className={styles.smallButton} onClick={() => changeQuantity(line.key, 1)}>+</button></div><button type="button" className={styles.removeButton} onClick={() => removeLine(line.key)}>Remover</button></div></div>)}</div>}

          <details className={styles.advancedSection}>
            <summary>Cliente e benefícios <span className={styles.mutedSmall}>opcional</span></summary>
            <div className={styles.advancedBody}>
              <div className={styles.section}>
                <div className={styles.rowBetween}><h3>Cliente</h3><button type="button" className={styles.smallButton} onClick={() => selectCustomer(null)}>Consumidor</button></div>
                {customerSearchEnabled ? <><input className={styles.field} value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setSelectedCustomer(null); setCustomerMatches([]); setCustomerSearchError(null); setCashbackText(""); setLoyaltyPointsText(""); }} placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar cliente no cadastro completo" />{customerSearchPending ? <div className={styles.mutedSmall} role="status">Buscando no cadastro completo…</div> : null}{customerSearchError ? <div className={styles.statusError}>{customerSearchError}</div> : null}{customerMatches.length > 0 ? <div className={styles.customerMatches}>{customerMatches.map((customer) => <button type="button" key={customer.id} className={styles.customerButton} onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><div className={styles.mutedSmall}>{customer.phone ?? customer.email ?? "Cliente cadastrado"} · Cashback {money(customer.cashbackBalanceCents)} · {customer.loyaltyBalancePoints} pts</div></button>)}</div> : null}</> : null}
                {selectedCustomer ? <div className={styles.customerSelected}><strong>{selectedCustomer.name}</strong><div className={styles.mutedSmall}>{selectedCustomer.phone ?? selectedCustomer.email ?? "Cliente cadastrado"}</div><div className={styles.mutedSmall}>Cashback {money(selectedCustomer.cashbackBalanceCents)} · Pontos {selectedCustomer.loyaltyBalancePoints}</div></div> : <div className={styles.twoColumns}><input className={styles.field} value={customerName} onChange={(event) => changeManualCustomer("name", event.target.value)} placeholder="Nome (opcional)" maxLength={120} /><input className={styles.field} value={customerPhone} onChange={(event) => changeManualCustomer("phone", event.target.value)} placeholder="Telefone" maxLength={32} inputMode="tel" /><input className={styles.field} value={customerEmail} onChange={(event) => changeManualCustomer("email", event.target.value)} placeholder="E-mail (opcional)" type="email" maxLength={200} /></div>}
              </div>
              <div className={styles.section}>
                <div className={styles.rowBetween}><h3>Benefícios</h3>{growthProjection.valid && growthProjection.discountCents > 0 ? <strong className={styles.benefitValue}>− {money(growthProjection.discountCents)}</strong> : null}</div>
                <div className={styles.twoColumns}>
                  <label style={{ display: "grid", gap: 4 }}><span className={styles.mutedSmall}>Cupom</span><input className={styles.field} list="pdv-coupons" value={couponCode} onChange={(event) => changeBenefit(setCouponCode, event.target.value.toUpperCase())} placeholder="Código" /><datalist id="pdv-coupons">{coupons.map((coupon) => <option key={coupon.id} value={coupon.code}>{coupon.name}</option>)}</datalist></label>
                  <label style={{ display: "grid", gap: 4 }}><span className={styles.mutedSmall}>Usar cashback</span><input className={styles.field} inputMode="decimal" value={cashbackText} onChange={(event) => changeBenefit(setCashbackText, event.target.value)} disabled={!selectedCustomer || !growthSettings.cashbackEnabled} placeholder={selectedCustomer ? money(selectedCustomer.cashbackBalanceCents) : "Identifique o cliente"} /></label>
                  <label style={{ display: "grid", gap: 4 }}><span className={styles.mutedSmall}>Usar pontos</span><input className={styles.field} type="number" min={0} value={loyaltyPointsText} onChange={(event) => changeBenefit(setLoyaltyPointsText, event.target.value)} disabled={!selectedCustomer || !growthSettings.loyaltyEnabled} placeholder={selectedCustomer ? `${selectedCustomer.loyaltyBalancePoints} disponíveis` : "Identifique o cliente"} /></label>
                </div>
                {!growthProjection.valid ? <div className={styles.statusError}>{growthProjection.message}</div> : growthProjection.discountCents > 0 ? <div className={styles.mutedSmall}>Cupom {money(growthProjection.couponDiscountCents)} · Cashback {money(growthProjection.cashbackDiscountCents)} · Pontos {money(growthProjection.loyaltyDiscountCents)}</div> : <div className={styles.mutedSmall}>Cupom pode ser usado sem cadastro quando a regra não limita uso por cliente. Cashback e pontos exigem cliente identificado.</div>}
              </div>
            </div>
          </details>

          <div className={styles.section}>
            <div className={styles.rowBetween}><h3>Pagamento</h3><button type="button" className={styles.smallButton} disabled={paymentMethods.length === 0 || saleTotal === 0 || payments.length >= 10} onClick={addPayment}>+ Dividir</button></div>
            {payments.map((payment, index) => <div key={payment.id} className={styles.paymentLine}><div className={styles.rowBetween}><strong>{payments.length > 1 ? `Parcela ${index + 1}` : "Forma de pagamento"}</strong>{payments.length > 1 ? <button type="button" className={styles.removeButton} onClick={() => removePayment(payment.id)}>Remover</button> : null}</div><select className={styles.select} value={payment.method} onChange={(event) => updatePayment(payment.id, { method: event.target.value as PosPaymentMethod, cashReceivedText: "", reference: "" })}>{paymentMethods.map((method) => <option key={method.method} value={method.method}>{method.label}</option>)}</select><div className={styles.twoColumns}><label style={{ display: "grid", gap: 4 }}><span className={styles.mutedSmall}>Valor {payments.length === 1 ? "(vazio = total)" : "da parcela"}</span><input className={styles.field} inputMode="decimal" value={payment.amountText} onChange={(event) => updatePayment(payment.id, { amountText: event.target.value })} placeholder={payments.length === 1 ? formatMoneyInput(saleTotal) : "0,00"} /></label>{payment.method === "cash" ? <label style={{ display: "grid", gap: 4 }}><span className={styles.mutedSmall}>Valor recebido</span><input className={styles.field} inputMode="decimal" value={payment.cashReceivedText} onChange={(event) => updatePayment(payment.id, { cashReceivedText: event.target.value })} placeholder="Ex.: 50,00" /></label> : <label style={{ display: "grid", gap: 4 }}><span className={styles.mutedSmall}>Referência/comprovante</span><input className={styles.field} value={payment.reference} onChange={(event) => updatePayment(payment.id, { reference: event.target.value })} maxLength={200} placeholder="Opcional" /></label>}</div></div>)}
          </div>

          <div className={styles.section}>
            {growthProjection.valid && growthProjection.discountCents > 0 ? <><div className={styles.rowBetween}><span className={styles.mutedSmall}>Subtotal</span><span>{money(cartSubtotal)}</span></div><div className={styles.rowBetween}><span className={styles.mutedSmall}>Benefícios</span><span>− {money(growthProjection.discountCents)}</span></div></> : null}
            <div className={styles.rowBetween}><strong>Total</strong><span className={styles.total}>{money(saleTotal)}</span></div>
            <button type="submit" className={styles.primaryButton} disabled={pending || cart.length === 0 || paymentMethods.length === 0 || !growthProjection.valid}>{pending ? "Finalizando venda…" : `Finalizar · ${money(saleTotal)}`}</button>
            <div className={styles.mutedSmall}>O servidor recalcula produtos, adicionais, benefícios e pagamentos antes de gravar.</div>
          </div>
        </form>
      </div>

      {configurator && configProduct ? <ProductConfigurator state={configurator} product={configProduct} onChange={setConfigurator} onCancel={() => setConfigurator(null)} onAdd={() => addCartLine(configProduct, configurator.modifierIds, configurator.quantity, configurator.note)} /> : null}
    </section>
  );
}
