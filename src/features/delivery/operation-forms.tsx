"use client";

import { useActionState, useMemo } from "react";
import { createDriverAction, deliveryOperationAction, updateDriverAction, type DeliveryActionState } from "@/features/delivery/actions";

const initial: DeliveryActionState = { ok: false, message: null, error: null };
const inputStyle: React.CSSProperties = { minHeight: 40, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "8px 10px", width: "100%" };
const buttonStyle: React.CSSProperties = { minHeight: 40, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };

function Feedback({ state }: { state: DeliveryActionState }) {
  if (state.error) return <div style={{ color: "#f97066", fontSize: 12 }}>{state.error}</div>;
  if (state.message) return <div style={{ color: "#22c55e", fontSize: 12 }}>{state.message}</div>;
  return null;
}

export function DeliveryOperationForm({
  intent, orderId, deliveryId, drivers = [], currentDriverId = null,
}: {
  intent: "waiting" | "assign" | "picked_up" | "out_for_delivery" | "delivered";
  orderId?: string;
  deliveryId?: string;
  drivers?: Array<{ id: string; name: string; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number }>;
  currentDriverId?: string | null;
}) {
  const [state, action, pending] = useActionState(deliveryOperationAction, initial);
  const key = useMemo(() => crypto.randomUUID(), []);
  const labels = { waiting: "Enviar para entregas", assign: currentDriverId ? "Reatribuir" : "Atribuir", picked_up: "Pedido retirado", out_for_delivery: "Saiu para entrega", delivered: "Marcar entregue" };
  const available = drivers.filter((driver) => driver.active && driver.on_duty && (driver.activeDeliveries < driver.max_active_deliveries || driver.id === currentDriverId));

  return (
    <form action={action} style={{ display: "grid", gap: 7 }}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
      {deliveryId ? <input type="hidden" name="deliveryId" value={deliveryId} /> : null}
      {intent === "assign" ? (
        <>
          <select name="driverId" required defaultValue={currentDriverId ?? ""} style={inputStyle}>
            <option value="" disabled>Selecione o entregador</option>
            {available.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.activeDeliveries}/{driver.max_active_deliveries}</option>)}
          </select>
          {currentDriverId ? <input name="reason" minLength={3} maxLength={500} placeholder="Motivo da reatribuição" style={inputStyle} /> : null}
        </>
      ) : null}
      <button type="submit" disabled={pending || (intent === "assign" && available.length === 0)} style={buttonStyle}>
        {pending ? "Processando…" : labels[intent]}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function DriverCreateForm() {
  const [state, action, pending] = useActionState(createDriverAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: 8 }}>
      <input name="name" required minLength={2} maxLength={100} placeholder="Nome do entregador" style={inputStyle} />
      <input name="phone" placeholder="Telefone" style={inputStyle} />
      <input name="userId" placeholder="ID do usuário (opcional para acesso ao app)" style={inputStyle} />
      <label style={{ display: "grid", gap: 4 }}><span className="muted" style={{ fontSize: 11 }}>CAPACIDADE SIMULTÂNEA</span><input name="maxActiveDeliveries" type="number" min={1} max={20} defaultValue={3} style={inputStyle} /></label>
      <button type="submit" disabled={pending} style={buttonStyle}>{pending ? "Salvando…" : "Cadastrar entregador"}</button>
      <Feedback state={state} />
    </form>
  );
}

export function DriverUpdateForm({ driver }: { driver: { id: string; name: string; phone: string | null; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number } }) {
  const [state, action, pending] = useActionState(updateDriverAction, initial);
  return (
    <form action={action} style={{ display: "grid", gap: 7, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
      <input type="hidden" name="driverId" value={driver.id} />
      <input name="name" required defaultValue={driver.name} style={inputStyle} />
      <input name="phone" defaultValue={driver.phone ?? ""} placeholder="Telefone" style={inputStyle} />
      <input name="maxActiveDeliveries" type="number" min={Math.max(1, driver.activeDeliveries)} max={20} defaultValue={driver.max_active_deliveries} style={inputStyle} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
        <label><input name="active" type="checkbox" defaultChecked={driver.active} /> Ativo</label>
        <label><input name="onDuty" type="checkbox" defaultChecked={driver.on_duty} /> Em serviço</label>
      </div>
      <button type="submit" disabled={pending} style={{ ...buttonStyle, background: "var(--surface-3, #333)" }}>{pending ? "Salvando…" : "Atualizar"}</button>
      <Feedback state={state} />
    </form>
  );
}
