"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  cancelPurchaseAction, configureSupplierAction, correctPurchaseReceiptAction, createPurchaseAction, createSupplierAction,
  receivePurchaseAction, sendPurchaseAction, upsertSupplierCatalogAction, type PurchaseActionState,
} from "@/features/purchases/actions";

const initial: PurchaseActionState = { ok: false, message: null, error: null };
const inputStyle: React.CSSProperties = { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "8px 10px", width: "100%" };
const buttonStyle: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };
function Feedback({ state }: { state: PurchaseActionState }) { if (state.error) return <div style={{ color: "#f97066", fontSize: 12 }}>{state.error}</div>; if (state.message) return <div style={{ color: "#22c55e", fontSize: 12 }}>{state.message}</div>; return null; }
function useIdempotencyKey(ok: boolean) { const [key,setKey] = useState(() => crypto.randomUUID()); useEffect(() => { if (ok) setKey(crypto.randomUUID()); }, [ok]); return key; }
function moneyInput(cents: number | string) { return (Number(cents || 0) / 100).toFixed(2).replace(".", ","); }

export function SupplierCreateForm() {
  const [state, action, pending] = useActionState(createSupplierAction, initial);
  return <form action={action} style={{ display: "grid", gap: 8 }}>
    <input name="name" required minLength={2} maxLength={160} placeholder="Nome do fornecedor" style={inputStyle} />
    <input name="legalName" maxLength={160} placeholder="Razão social (opcional)" style={inputStyle} />
    <input name="taxDocument" maxLength={40} placeholder="CNPJ/Documento (opcional)" style={inputStyle} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input name="email" type="email" placeholder="E-mail" style={inputStyle} /><input name="phone" placeholder="Telefone" style={inputStyle} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><label><span className="muted" style={{ fontSize: 10 }}>PRAZO PADRÃO (DIAS)</span><input name="leadTimeDays" type="number" min={0} max={365} defaultValue={0} style={inputStyle} /></label><label><span className="muted" style={{ fontSize: 10 }}>PEDIDO MÍNIMO (R$)</span><input name="minimumOrder" inputMode="decimal" defaultValue="0,00" style={inputStyle} /></label></div>
    <textarea name="notes" maxLength={2000} placeholder="Observações" style={{ ...inputStyle, minHeight: 70 }} />
    <button disabled={pending} style={buttonStyle}>{pending ? "Salvando…" : "Criar fornecedor"}</button><Feedback state={state} />
  </form>;
}

export function SupplierConfigForm({ supplierId, active, leadTimeDays, minimumOrderCents, notes }: { supplierId: string; active: boolean; leadTimeDays: number; minimumOrderCents: number | string; notes?: string | null }) {
  const [state, action, pending] = useActionState(configureSupplierAction, initial);
  return <form action={action} style={{ display: "grid", gap: 7 }}><input type="hidden" name="supplierId" value={supplierId} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input name="leadTimeDays" type="number" min={0} max={365} defaultValue={leadTimeDays} style={inputStyle} /><input name="minimumOrder" inputMode="decimal" defaultValue={moneyInput(minimumOrderCents)} style={inputStyle} /></div>
    <input name="notes" maxLength={1000} defaultValue={notes ?? ""} placeholder="Observações da unidade" style={inputStyle} /><label style={{ fontSize: 12 }}><input name="active" type="checkbox" defaultChecked={active} /> Ativo nesta unidade</label>
    <button disabled={pending} style={{ ...buttonStyle, background: "var(--surface-3, #333)" }}>{pending ? "Salvando…" : "Salvar condições"}</button><Feedback state={state} />
  </form>;
}

export function SupplierCatalogForm({ supplierId, inventory }: { supplierId: string; inventory: Array<{ id: string; name: string; base_unit: string }> }) {
  const [state, action, pending] = useActionState(upsertSupplierCatalogAction, initial);
  return <form action={action} style={{ display: "grid", gap: 7 }}><input type="hidden" name="supplierId" value={supplierId} />
    <select name="inventoryItemId" required defaultValue="" style={inputStyle}><option value="" disabled>Selecione o insumo</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit === "unit" ? "un" : item.base_unit}</option>)}</select>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input name="supplierSku" placeholder="Código no fornecedor" style={inputStyle} /><input name="purchaseUnitLabel" required placeholder="Ex.: caixa 12un / saco 5kg" style={inputStyle} /></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input name="baseUnitsPerPurchaseUnit" required inputMode="decimal" placeholder="Unidades-base por embalagem" style={inputStyle} /><input name="unitCostInput" inputMode="decimal" placeholder="Custo por embalagem (R$)" style={inputStyle} /></div>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}><label><input name="active" type="checkbox" defaultChecked /> Ativo</label><label><input name="preferred" type="checkbox" /> Fornecedor preferencial</label></div>
    <button disabled={pending || inventory.length === 0} style={buttonStyle}>{pending ? "Salvando…" : "Salvar item do catálogo"}</button><Feedback state={state} />
  </form>;
}

type CatalogRow = { supplier_id: string; inventory_item_id: string; purchase_unit_label: string; base_units_per_purchase_unit: string | number; last_unit_cost_cents: string | number; inventory: { id: string; name: string; base_unit: string } | null };
export function PurchaseCreateForm({ suppliers, catalog }: { suppliers: Array<{ id: string; name: string }>; catalog: CatalogRow[] }) {
  const [state, action, pending] = useActionState(createPurchaseAction, initial); const key = useIdempotencyKey(state.ok);
  const [supplierId,setSupplierId] = useState(suppliers[0]?.id ?? ""); const rows = useMemo(() => catalog.filter((row) => row.supplier_id === supplierId && row.inventory), [catalog,supplierId]);
  return <form action={action} style={{ display: "grid", gap: 10 }}><input type="hidden" name="idempotencyKey" value={key} />
    <select name="supplierId" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}><option value="" disabled>Fornecedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select>
    {rows.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Cadastre os insumos deste fornecedor antes de criar a compra.</div> : rows.map((row) => <div key={row.inventory_item_id} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) 110px 120px", gap: 7, alignItems: "end" }}>
      <div><strong style={{ fontSize: 12 }}>{row.inventory?.name}</strong><div className="muted" style={{ fontSize: 10 }}>{row.purchase_unit_label} = {String(row.base_units_per_purchase_unit)} {row.inventory?.base_unit}</div><input type="hidden" name="inventoryItemId" value={row.inventory_item_id} /></div>
      <input name="quantity" inputMode="decimal" placeholder="Qtd." style={inputStyle} />
      <input name="unitCostInput" inputMode="decimal" defaultValue={moneyInput(row.last_unit_cost_cents)} placeholder="R$/embalagem" style={inputStyle} />
    </div>)}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><label><span className="muted" style={{ fontSize: 10 }}>PREVISÃO</span><input name="expectedAt" type="datetime-local" style={inputStyle} /></label><label><span className="muted" style={{ fontSize: 10 }}>OBSERVAÇÃO</span><input name="notes" maxLength={2000} style={inputStyle} /></label></div>
    <button disabled={pending || rows.length === 0} style={buttonStyle}>{pending ? "Criando…" : "Criar pedido de compra"}</button><Feedback state={state} />
  </form>;
}

export function SendPurchaseForm({ orderId }: { orderId: string }) { const [state,action,pending] = useActionState(sendPurchaseAction,initial); return <form action={action} style={{ display: "grid", gap: 5 }}><input type="hidden" name="purchaseOrderId" value={orderId} /><button disabled={pending} style={buttonStyle}>{pending ? "Enviando…" : "Marcar enviado"}</button><Feedback state={state} /></form>; }
export function CancelPurchaseForm({ orderId }: { orderId: string }) { const [state,action,pending] = useActionState(cancelPurchaseAction,initial); return <form action={action} style={{ display: "grid", gap: 5 }}><input type="hidden" name="purchaseOrderId" value={orderId} /><input name="reason" required minLength={3} maxLength={500} placeholder="Motivo do cancelamento" style={inputStyle} /><button disabled={pending} style={{ ...buttonStyle, background: "#b42318" }}>{pending ? "Cancelando…" : "Cancelar pedido"}</button><Feedback state={state} /></form>; }

type PurchaseItem = { id: string; inventory_name_snapshot: string; purchase_unit_label_snapshot: string; ordered_purchase_quantity: string | number; received_purchase_quantity: string | number; unit_cost_cents: string | number };
export function ReceivePurchaseForm({ orderId, items }: { orderId: string; items: PurchaseItem[] }) {
  const [state,action,pending] = useActionState(receivePurchaseAction,initial); const key = useIdempotencyKey(state.ok);
  const open = items.filter((item) => Number(item.received_purchase_quantity) < Number(item.ordered_purchase_quantity));
  return <form action={action} style={{ display: "grid", gap: 8 }}><input type="hidden" name="purchaseOrderId" value={orderId} /><input type="hidden" name="idempotencyKey" value={key} />
    {open.map((item) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) 100px 120px", gap: 7, alignItems: "end" }}><div><strong style={{ fontSize: 12 }}>{item.inventory_name_snapshot}</strong><div className="muted" style={{ fontSize: 10 }}>{item.received_purchase_quantity}/{item.ordered_purchase_quantity} {item.purchase_unit_label_snapshot}</div><input type="hidden" name="purchaseOrderItemId" value={item.id} /></div><input name="quantity" inputMode="decimal" placeholder="Recebido" style={inputStyle} /><input name="unitCostInput" inputMode="decimal" defaultValue={moneyInput(item.unit_cost_cents)} style={inputStyle} /></div>)}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><input name="reference" maxLength={120} placeholder="NF / referência" style={inputStyle} /><input name="notes" maxLength={2000} placeholder="Observação" style={inputStyle} /></div>
    <button disabled={pending || open.length === 0} style={buttonStyle}>{pending ? "Recebendo…" : "Registrar recebimento"}</button><Feedback state={state} />
  </form>;
}

export function CorrectReceiptForm({ orderId, receiptId, items }: { orderId: string; receiptId: string; items: PurchaseItem[] }) {
  const [state,action,pending] = useActionState(correctPurchaseReceiptAction,initial); const key = useIdempotencyKey(state.ok);
  return <form action={action} style={{ display: "grid", gap: 7 }}><input type="hidden" name="purchaseOrderId" value={orderId} /><input type="hidden" name="receiptId" value={receiptId} /><input type="hidden" name="idempotencyKey" value={key} />
    {items.map((item) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(140px,1fr) 100px 120px", gap: 7, alignItems: "end" }}><div><strong style={{ fontSize: 12 }}>{item.inventory_name_snapshot}</strong><div className="muted" style={{ fontSize: 10 }}>Use + para complementar e − para estornar</div><input type="hidden" name="purchaseOrderItemId" value={item.id} /></div><input name="quantityDelta" inputMode="decimal" placeholder="Ex.: -0,5" style={inputStyle} /><input name="unitCostInput" inputMode="decimal" defaultValue={moneyInput(item.unit_cost_cents)} style={inputStyle} /></div>)}
    <input name="reason" required minLength={3} maxLength={500} placeholder="Motivo da correção" style={inputStyle} /><button disabled={pending} style={{ ...buttonStyle, background: "var(--surface-3, #333)" }}>{pending ? "Corrigindo…" : "Registrar correção"}</button><Feedback state={state} />
  </form>;
}
