"use client";

import { useActionState, useMemo, useId } from "react";
import { createDriverAction, deliveryOperationAction, updateDriverAction, type DeliveryActionState } from "@/features/delivery/actions";
import { confirmDeliveryWithPaymentAction } from "@/features/delivery/delivery-confirmation-actions";
import styles from "@/features/delivery/delivery.module.css";
import { Input, PhoneInput, QuantityInput, Checkbox } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";

const initial: DeliveryActionState = { ok: false, message: null, error: null };

function Feedback({ state }: { state: DeliveryActionState }) {
  if (state.error) return <div role="alert" className={styles.feedback} data-tone="danger">{state.error}</div>;
  if (state.message) return <div role="status" className={styles.feedback} data-tone="success">{state.message}</div>;
  return null;
}

export function DeliveryOperationForm({
  intent, orderId, deliveryId, drivers = [], currentDriverId = null, prominent = false, paymentPending = false, disabled = false, disabledLabel = null,
}: {
  intent: "waiting" | "claim" | "assign" | "picked_up" | "out_for_delivery" | "delivered";
  orderId?: string;
  deliveryId?: string;
  drivers?: Array<{ id: string; name: string; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number }>;
  currentDriverId?: string | null;
  prominent?: boolean;
  paymentPending?: boolean;
  disabled?: boolean;
  disabledLabel?: string | null;
}) {
  const serverAction = intent === "delivered" ? confirmDeliveryWithPaymentAction : deliveryOperationAction;
  const [state, action, pending] = useActionState(serverAction, initial);
  const key = useMemo(() => crypto.randomUUID(), []);
  const labels = { waiting: "Enviar para entregas", claim: "Pegar pedido", assign: currentDriverId ? "Reatribuir" : "Atribuir", picked_up: "Confirmar retirada", out_for_delivery: "Iniciar rota", delivered: "Confirmar entrega" };
  const available = drivers.filter((driver) => driver.active && driver.on_duty && (driver.activeDeliveries < driver.max_active_deliveries || driver.id === currentDriverId));
  const isDisabled = disabled || (intent === "assign" && available.length === 0);

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
      <button type="submit" disabled={pending || isDisabled} className={`${styles.button} ${prominent ? styles.prominentButton : ""}`}>{isDisabled ? (disabledLabel ?? labels[intent]) : pending ? "Processando…" : labels[intent]}</button>
      <Feedback state={state} />
    </form>
  );
}

export function DriverCreateForm() {
  const fieldId = useId();
  const [state, action, pending] = useActionState(createDriverAction, initial);
  const key = useMemo(() => crypto.randomUUID(), []);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="idempotencyKey" value={key} />
    <Input id={`${fieldId}-name`} label="Nome do entregador" name="name" required minLength={2} maxLength={100} placeholder="Nome do entregador" />
    <PhoneInput id={`${fieldId}-phone`} label="Telefone" name="phone" placeholder="Telefone" />
    <QuantityInput id={`${fieldId}-capacity`} label="Capacidade simultânea" name="maxActiveDeliveries" min={1} max={20} defaultValue={3} />
    <div className={styles.driverMeta}>O entregador será cadastrado como ativo e em serviço, pronto para receber pedidos. O acesso pelo celular poderá ser vinculado depois sem precisar informar nenhum código técnico.</div>
    <Button type="submit" loading={pending} loadingLabel="Salvando…">Cadastrar e deixar disponível</Button>
    <Feedback state={state} />
  </form>;
}

export function DriverUpdateForm({ driver }: { driver: { id: string; name: string; phone: string | null; active: boolean; on_duty: boolean; max_active_deliveries: number; activeDeliveries: number } }) {
  const [state, action, pending] = useActionState(updateDriverAction, initial);
  const key = useMemo(() => crypto.randomUUID(), [driver.id]);
  return <form action={action} className={styles.form}>
    <input type="hidden" name="idempotencyKey" value={key} />
    <input type="hidden" name="driverId" value={driver.id} />
    <Input id={`driver-${driver.id}-name`} label="Nome do entregador" name="name" required defaultValue={driver.name} />
    <PhoneInput id={`driver-${driver.id}-phone`} label="Telefone" name="phone" defaultValue={driver.phone ?? ""} placeholder="Telefone" />
    <QuantityInput id={`driver-${driver.id}-capacity`} label="Capacidade simultânea" name="maxActiveDeliveries" min={Math.max(1, driver.activeDeliveries)} max={20} defaultValue={driver.max_active_deliveries} />
    <div className={styles.headerActions}>
      <Checkbox id={`driver-${driver.id}-active`} name="active" label="Ativo" defaultChecked={driver.active} />
      <Checkbox id={`driver-${driver.id}-duty`} name="onDuty" label="Em serviço" defaultChecked={driver.on_duty} />
    </div>
    <Button type="submit" loading={pending} loadingLabel="Salvando…">Salvar entregador</Button>
    <Feedback state={state} />
  </form>;
}
