"use client";

import { useActionState, useMemo } from "react";
import { createDriverAction, deliveryOperationAction, updateDriverAction, type DeliveryActionState } from "@/features/delivery/actions";
import { confirmDeliveryWithPaymentAction } from "@/features/delivery/delivery-confirmation-actions";
import styles from "@/features/delivery/delivery.module.css";

const initial: DeliveryActionState = { ok: false, message: null, error: null };

function Feedback({ state }: { state: DeliveryActionState }) {
  if (state.error) return <div className={styles.feedback} data-tone="danger">{state.error}</div>;
  if (state.message) return <div className={styles.feedback} data-tone="success">{state.message}</div>;
  return null;
}

export function DeliveryOperationForm({
  intent, orderId, deliveryId, drivers = [], currentDriverId = null, prominent = false, paymentPending = false,
}: {
  intent: "waiting" | "assign" | "picked_up" | "out_for_delivery" | "delivered";
  orderId?: string;
  deliveryId?: string;
  drivers?: Array<{ id: string; name: string; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number }>;
  currentDriverId?: string | null;
  prominent?: boolean;
  paymentPending?: boolean;
}) {
  const serverAction = intent === "delivered" ? confirmDeliveryWithPaymentAction : deliveryOperationAction;
  const [state, action, pending] = useActionState(serverAction, initial);
  const key = useMemo(() => crypto.randomUUID(), []);
  const labels = { waiting: "Enviar para entregas", assign: currentDriverId ? "Reatribuir" : "Atribuir", picked_up: "Confirmar retirada", out_for_delivery: "Iniciar rota", delivered: "Confirmar entrega" };
  const available = drivers.filter((driver) => driver.active && driver.on_duty && (driver.activeDeliveries < driver.max_active_deliveries || driver.id === currentDriverId));

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {orderId ? <input type="hidden" name="orderId" value={orderId} /> : null}
      {deliveryId ? <input type="hidden" name="deliveryId" value={deliveryId} /> : null}
      {intent === "assign" ? <>
        <select name="driverId" required defaultValue={currentDriverId ?? ""} className={styles.select}>
          <option value="" disabled>Selecione o entregador</option>
          {available.map((driver) => <option key={driver.id} value={driver.id}>{driver.name} · {driver.activeDeliveries}/{driver.max_active_deliveries}</option>)}
        </select>
        {currentDriverId ? <input name="reason" minLength={3} maxLength={500} placeholder="Motivo da reatribuição" className={styles.input} /> : null}
      </> : null}
      {intent === "delivered" && paymentPending ? <div className={styles.form}>
        <label className={styles.driverMeta} htmlFor={`payment-outcome-${key}`}>PAGAMENTO NA ENTREGA</label>
        <select id={`payment-outcome-${key}`} name="paymentOutcome" defaultValue="received" className={styles.select}>
          <option value="received">Pagamento recebido</option>
          <option value="not_received">Não recebi / houve problema</option>
        </select>
        <textarea
          name="paymentNote"
          maxLength={500}
          placeholder="Se não recebeu, explique rapidamente o que aconteceu. Ex.: cliente sem dinheiro, pagamento combinado para depois..."
          className={styles.input}
          rows={3}
        />
        <div className={styles.driverMeta}>Por padrão, confirmar a entrega também confirma o pagamento pendente. Se houver problema, selecione “Não recebi” e registre a observação.</div>
      </div> : null}
      <button type="submit" disabled={pending || (intent === "assign" && available.length === 0)} className={`${styles.button} ${prominent ? styles.prominentButton : ""}`}>{pending ? "Processando…" : labels[intent]}</button>
      <Feedback state={state} />
    </form>
  );
}

export function DriverCreateForm() {
  const [state, action, pending] = useActionState(createDriverAction, initial);
  return <form action={action} className={styles.form}>
    <input name="name" required minLength={2} maxLength={100} placeholder="Nome do entregador" className={styles.input} />
    <input name="phone" placeholder="Telefone" className={styles.input} />
    <label className={styles.form}><span className={styles.driverMeta}>CAPACIDADE SIMULTÂNEA</span><input name="maxActiveDeliveries" type="number" min={1} max={20} defaultValue={3} className={styles.input} /></label>
    <div className={styles.driverMeta}>O entregador será cadastrado como ativo e em serviço, pronto para receber pedidos. O acesso pelo celular poderá ser vinculado depois sem precisar informar nenhum código técnico.</div>
    <button type="submit" disabled={pending} className={styles.button}>{pending ? "Salvando…" : "Cadastrar e deixar disponível"}</button>
    <Feedback state={state} />
  </form>;
}

export function DriverUpdateForm({ driver }: { driver: { id: string; name: string; phone: string | null; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number } }) {
  const [state, action, pending] = useActionState(updateDriverAction, initial);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="driverId" value={driver.id} />
    <input name="name" required defaultValue={driver.name} className={styles.input} />
    <input name="phone" defaultValue={driver.phone ?? ""} placeholder="Telefone" className={styles.input} />
    <input name="maxActiveDeliveries" type="number" min={Math.max(1, driver.activeDeliveries)} max={20} defaultValue={driver.max_active_deliveries} className={styles.input} />
    <div className={styles.headerActions}>
      <label><input name="active" type="checkbox" defaultChecked={driver.active} /> Ativo</label>
      <label><input name="onDuty" type="checkbox" defaultChecked={driver.on_duty} /> Em serviço</label>
    </div>
    <button type="submit" disabled={pending} className={styles.secondaryButton}>{pending ? "Salvando…" : "Atualizar"}</button>
    <Feedback state={state} />
  </form>;
}
