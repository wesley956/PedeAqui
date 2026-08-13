"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createInventoryItemAction, enableInventoryItemAction, inventoryMovementAction, inventoryReconcileAction,
  inventoryTransferAction, updateInventoryStoreItemAction, type InventoryActionState,
} from "@/features/inventory/actions";
import type { InventoryBaseUnit } from "@/server/inventory/values";

const initial: InventoryActionState = { ok: false, message: null, error: null };
const inputStyle: React.CSSProperties = { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "8px 10px", width: "100%" };
const buttonStyle: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };

function Feedback({ state }: { state: InventoryActionState }) {
  if (state.error) return <div style={{ color: "#f97066", fontSize: 12 }}>{state.error}</div>;
  if (state.message) return <div style={{ color: "#22c55e", fontSize: 12 }}>{state.message}</div>;
  return null;
}
function costLabel(unit: InventoryBaseUnit) { return unit === "g" ? "Custo por kg (R$)" : unit === "ml" ? "Custo por litro (R$)" : "Custo por unidade (R$)"; }
function useIdempotencyKey(state: InventoryActionState) {
  const [key, setKey] = useState("");
  useEffect(() => { setKey(crypto.randomUUID()); }, []);
  useEffect(() => {
    if (state.message || state.error) setKey(crypto.randomUUID());
  }, [state]);
  return key;
}

export function InventoryItemCreateForm() {
  const [state, action, pending] = useActionState(createInventoryItemAction, initial);
  const [unit, setUnit] = useState<InventoryBaseUnit>("unit");
  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      <input name="name" required minLength={2} maxLength={120} placeholder="Ex.: Queijo muçarela" style={inputStyle} />
      <input name="sku" maxLength={80} placeholder="SKU interno (opcional)" style={inputStyle} />
      <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 11 }}>UNIDADE-BASE</span><select name="baseUnit" value={unit} onChange={(event) => setUnit(event.target.value as InventoryBaseUnit)} style={inputStyle}><option value="unit">Unidade</option><option value="g">Grama</option><option value="ml">Mililitro</option></select></label>
      <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 11 }}>ESTOQUE MÍNIMO</span><input name="minimumQuantity" inputMode="decimal" defaultValue="0" style={inputStyle} /></label>
      <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 11 }}>{costLabel(unit).toUpperCase()}</span><input name="costInput" inputMode="decimal" placeholder="0,00" style={inputStyle} /></label>
      <label style={{ fontSize: 12 }}><input type="checkbox" name="allowNegative" defaultChecked /> Permitir saldo negativo quando a operação já ocorreu</label>
      <button disabled={pending} style={buttonStyle}>{pending ? "Salvando…" : "Criar insumo"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function EnableInventoryItemForm({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState(enableInventoryItemAction, initial);
  return <form action={action} style={{ display: "grid", gap: 7 }}><input type="hidden" name="inventoryItemId" value={itemId} /><input name="minimumQuantity" inputMode="decimal" defaultValue="0" placeholder="Estoque mínimo" style={inputStyle} /><label style={{ fontSize: 12 }}><input type="checkbox" name="allowNegative" defaultChecked /> Permitir negativo</label><button disabled={pending} style={buttonStyle}>{pending ? "Habilitando…" : "Habilitar nesta unidade"}</button><Feedback state={state} /></form>;
}

export function InventorySettingsForm({ itemId, baseUnit, active, minimumQuantity, allowNegative, costInput }: { itemId: string; baseUnit: InventoryBaseUnit; active: boolean; minimumQuantity: string; allowNegative: boolean; costInput: string }) {
  const [state, action, pending] = useActionState(updateInventoryStoreItemAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: 7 }}>
      <input type="hidden" name="inventoryItemId" value={itemId} /><input type="hidden" name="baseUnit" value={baseUnit} />
      <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 10 }}>ESTOQUE MÍNIMO</span><input name="minimumQuantity" inputMode="decimal" defaultValue={minimumQuantity} style={inputStyle} /></label>
      <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 10 }}>{costLabel(baseUnit).toUpperCase()}</span><input name="costInput" inputMode="decimal" defaultValue={costInput} style={inputStyle} /></label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}><label><input name="active" type="checkbox" defaultChecked={active} /> Ativo</label><label><input name="allowNegative" type="checkbox" defaultChecked={allowNegative} /> Permitir negativo</label></div>
      <button disabled={pending} style={{ ...buttonStyle, background: "var(--surface-3, #333)" }}>{pending ? "Salvando…" : "Salvar configuração"}</button><Feedback state={state} />
    </form>
  );
}

export function InventoryMovementForm({ itemId, baseUnit }: { itemId: string; baseUnit: InventoryBaseUnit }) {
  const [state, action, pending] = useActionState(inventoryMovementAction, initial);
  const key = useIdempotencyKey(state);
  const [type, setType] = useState("purchase");
  return (
    <form action={action} style={{ display: "grid", gap: 7 }}>
      <input type="hidden" name="inventoryItemId" value={itemId} /><input type="hidden" name="baseUnit" value={baseUnit} /><input type="hidden" name="idempotencyKey" value={key} />
      <select name="movementType" value={type} onChange={(event) => setType(event.target.value)} style={inputStyle}><option value="purchase">Entrada</option><option value="return">Retorno</option><option value="loss">Perda</option><option value="adjustment">Ajuste (+ ou -)</option><option value="production">Consumo de produção</option></select>
      <input name="quantity" required inputMode="decimal" placeholder={type === "adjustment" ? "Ex.: -2,5" : "Quantidade"} style={inputStyle} />
      {(type === "purchase" || type === "return") ? <input name="costInput" inputMode="decimal" placeholder={costLabel(baseUnit)} style={inputStyle} /> : null}
      <input name="reason" required={!["purchase", "return"].includes(type)} minLength={3} maxLength={500} placeholder="Motivo / observação" style={inputStyle} />
      <button disabled={pending} style={buttonStyle}>{pending ? "Registrando…" : "Registrar movimento"}</button><Feedback state={state} />
    </form>
  );
}

export function InventoryTransferForm({ itemId, stores, currentStoreId }: { itemId: string; stores: Array<{ id: string; name: string }>; currentStoreId: string }) {
  const [state, action, pending] = useActionState(inventoryTransferAction, initial);
  const key = useIdempotencyKey(state);
  const targets = stores.filter((store) => store.id !== currentStoreId);
  return (
    <form action={action} style={{ display: "grid", gap: 7 }}><input type="hidden" name="inventoryItemId" value={itemId} /><input type="hidden" name="idempotencyKey" value={key} /><select name="targetStoreId" required defaultValue="" style={inputStyle}><option value="" disabled>Unidade destino</option>{targets.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select><input name="quantity" required inputMode="decimal" placeholder="Quantidade" style={inputStyle} /><input name="reason" required minLength={3} maxLength={500} placeholder="Motivo da transferência" style={inputStyle} /><button disabled={pending || targets.length === 0} style={buttonStyle}>{pending ? "Transferindo…" : "Transferir"}</button><Feedback state={state} /></form>
  );
}

export function InventoryReconcileForm({ itemId }: { itemId: string }) {
  const [state, action, pending] = useActionState(inventoryReconcileAction, initial);
  const key = useIdempotencyKey(state);
  return <form action={action} style={{ display: "grid", gap: 7 }}><input type="hidden" name="inventoryItemId" value={itemId} /><input type="hidden" name="idempotencyKey" value={key} /><input name="countedQuantity" required inputMode="decimal" placeholder="Quantidade contada" style={inputStyle} /><input name="reason" required minLength={3} maxLength={500} placeholder="Motivo da contagem" style={inputStyle} /><button disabled={pending} style={buttonStyle}>{pending ? "Conciliando…" : "Conciliar contagem"}</button><Feedback state={state} /></form>;
}
