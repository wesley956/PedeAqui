"use client";

import { useActionState, useMemo, useState } from "react";
import { createRecipeVersionAction, type InventoryActionState } from "@/features/inventory/actions";

const initial: InventoryActionState = { ok: false, message: null, error: null };
const inputStyle: React.CSSProperties = { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "8px 10px", width: "100%" };
const buttonStyle: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };

type InventoryOption = { id: string; name: string; base_unit: string };
type TargetOption = { id: string; name: string };

export function RecipeVersionForm({ products, modifiers, inventoryItems }: { products: TargetOption[]; modifiers: Array<{ id: string; label: string }>; inventoryItems: InventoryOption[] }) {
  const [state, action, pending] = useActionState(createRecipeVersionAction, initial);
  const [targetType, setTargetType] = useState<"product" | "modifier">("product");
  const [rows, setRows] = useState(() => [{ id: crypto.randomUUID() }]);
  const targets = targetType === "product" ? products.map((item) => ({ id: item.id, label: item.name })) : modifiers;
  const nowLocal = useMemo(() => {
    const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }, []);
  return (
    <form action={action} style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
        <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 10 }}>TIPO</span><select name="targetType" value={targetType} onChange={(event) => setTargetType(event.target.value as "product" | "modifier")} style={inputStyle}><option value="product">Produto</option><option value="modifier">Adicional</option></select></label>
        <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 10 }}>ALVO DA FICHA</span><select key={targetType} name="targetId" required defaultValue="" style={inputStyle}><option value="" disabled>Selecione</option>{targets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 10 }}>VIGÊNCIA</span><input name="effectiveAt" type="datetime-local" defaultValue={nowLocal} style={inputStyle} /></label>
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        <strong style={{ fontSize: 13 }}>Insumos</strong>
        {rows.map((row, index) => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(100px,.35fr) auto", gap: 7 }}>
            <select name="inventoryItemId" required defaultValue="" style={inputStyle}><option value="" disabled>Selecione o insumo</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_unit === "unit" ? "un" : item.base_unit}</option>)}</select>
            <input name="quantity" required inputMode="decimal" placeholder="Quantidade" style={inputStyle} />
            <button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} style={{ ...buttonStyle, background: "var(--surface-3, #333)", paddingInline: 10 }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((current) => [...current, { id: crypto.randomUUID() }])} style={{ ...buttonStyle, background: "var(--surface-3, #333)" }}>+ Adicionar insumo</button>
      </div>
      <textarea name="notes" maxLength={1000} placeholder="Observações da versão (opcional)" style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} />
      <div className="muted" style={{ fontSize: 11 }}>Salvar cria uma nova versão imutável. Versões anteriores não são editadas e continuam válidas para pedidos confirmados no período correspondente.</div>
      <button type="submit" disabled={pending || inventoryItems.length === 0 || targets.length === 0} style={buttonStyle}>{pending ? "Criando versão…" : "Criar nova versão"}</button>
      {state.message ? <div style={{ color: "#22c55e", fontSize: 12 }}>{state.message}</div> : null}
      {state.error ? <div style={{ color: "#f97066", fontSize: 12 }}>{state.error}</div> : null}
    </form>
  );
}
