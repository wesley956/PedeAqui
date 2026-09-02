import Link from "next/link";
import { CustomOrderWorkflowBoard } from "@/features/orders/custom-order-workflow-board";
import { Alert } from "@/components/ui/feedback";
import { OrderManagerBoard } from "@/features/orders/order-manager-board";
import { OrderListPosition } from "@/features/orders/order-navigation-memory";
import styles from "@/features/orders/order-manager.module.css";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import { DEFAULT_STORE_TIMEZONE, formatStoreDateTime } from "@/lib/store-date-time";
import { isManualDeliveryMode } from "@/modules/manual-delivery";
import { isDeliveredWithPaymentPending, isFlexiblePaymentQueue, type PaymentCompletionPolicy } from "@/modules/payment-completion-policy";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { OrderService } from "@/server/orders/order-service";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";
import { fulfillmentIsComplete, paymentAllowsOrderCompletion, type FulfillmentStatus, type PaymentStatus } from "@/server/orders/state-machines";

export default async function OrdersPage() {
  const [{ context, orders, recentFinalized, recentFinalizedWindowMinutes, workflowMode: legacyWorkflowMode, deliveryOperationLevel, paymentCompletionPolicy }, { settings }, moduleSnapshot] = await Promise.all([
    OrderService.list(),
    OrderWorkflowSettingsService.get(),
    ModuleAccessService.load(),
  ]);
  if (!context.storeId) throw new Error("An active store is required");
  const workflowMode = settings.mode === "custom" ? "custom" : legacyWorkflowMode;
  const paymentPolicy = paymentCompletionPolicy as PaymentCompletionPolicy | null;
  const rows = (orders as OrderManagerRow[]).filter((order) => !isFlexiblePaymentQueue(paymentPolicy) || !isDeliveredWithPaymentPending(order));
  const activeCount = rows.filter((order) => !["completed", "canceled", "rejected"].includes(order.order_status)).length;
  const finalFulfillment = rows.filter((order) => order.order_status === "confirmed" && fulfillmentIsComplete(order.fulfillment_status as FulfillmentStatus));
  const readyToReconcile = finalFulfillment.filter((order) => paymentAllowsOrderCompletion(order.payment_status as PaymentStatus));
  const awaitingPayment = finalFulfillment.filter((order) => !paymentAllowsOrderCompletion(order.payment_status as PaymentStatus));
  const manualDeliveryMode = isManualDeliveryMode(moduleSnapshot.enabledModuleKeys, deliveryOperationLevel);
  const timeZone = context.timezone ?? DEFAULT_STORE_TIMEZONE;

  return (
    <section className={styles.page}>
      <OrderListPosition storageKey="orders:active" />
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <p className={styles.pageEyebrow}>OPERAÇÃO</p>
          <h1>Pedidos</h1>
          <p className={styles.pageHint}>Veja o que entrou, o que está em andamento e qual pedido precisa da próxima ação.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.activeBadge}>{activeCount} ativo(s)</span>
          <Link href="/pedidos/historico" className={styles.detailsLink}>Ver histórico</Link>
        </div>
      </header>

      <div className={styles.workflowNote}>
        {workflowMode === "simplified"
          ? manualDeliveryMode
            ? "Fluxo simplificado: Iniciar → Pronto → Saiu para entrega → Finalizar pedido."
            : "Fluxo simplificado: Iniciar → Pronto → Finalizados."
          : workflowMode === "custom"
            ? manualDeliveryMode
              ? "O quadro segue os checkpoints definidos em Configurações. Entregas sem gestão de entregador são atualizadas aqui mesmo."
              : "O quadro segue os checkpoints definidos em Configurações."
            : manualDeliveryMode
              ? "Entrega manual ativa: pedidos de entrega avançam pelo próprio gestor de pedidos, sem exigir entregador cadastrado."
              : "A tela atualiza automaticamente enquanto a operação estiver aberta."}
      </div>

      {finalFulfillment.length > 0 ? <Alert
        tone={readyToReconcile.length > 0 ? "warning" : "info"}
        title={`${finalFulfillment.length} pedido(s) com atendimento finalizado`}
      >
        {readyToReconcile.length > 0 ? `${readyToReconcile.length} já estão pagos e podem ser concluídos com segurança. ` : ""}
        {awaitingPayment.length > 0 ? `${awaitingPayment.length} continuam aguardando confirmação de pagamento; o PedeAqui não dará baixa automaticamente.` : ""}
      </Alert> : null}

      {workflowMode === "custom"
        ? <CustomOrderWorkflowBoard storeId={context.storeId} orders={rows} config={settings.custom} manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} />
        : <OrderManagerBoard storeId={context.storeId} orders={rows} workflowMode={workflowMode} manualDeliveryMode={manualDeliveryMode} paymentPolicy={paymentPolicy} timeZone={timeZone} />}

      <section className={styles.recentFinalized} aria-labelledby="recent-finalized-title">
        <div className={styles.recentFinalizedHeader}>
          <div>
            <h2 id="recent-finalized-title">Finalizados recentemente</h2>
            <p className={styles.pageHint}>Últimas {recentFinalizedWindowMinutes / 60} horas. Esta lista atravessa a meia-noite sem misturar o histórico completo ao quadro.</p>
          </div>
          <Link href="/pedidos/historico" className={styles.detailsLink}>Abrir histórico completo</Link>
        </div>
        <div className={styles.recentFinalizedGrid}>
          {(recentFinalized as OrderManagerRow[]).map((order) => <Link key={order.id} href={{ pathname: `/pedidos/${order.id}`, query: { from: "/pedidos" } }} className={styles.recentFinalizedItem}>
            <strong>#{order.display_number} · {order.customer_name_snapshot}</strong>
            <span>{order.order_status === "completed" ? "Concluído" : order.order_status === "canceled" ? "Cancelado" : "Recusado"} · {formatStoreDateTime(order.updated_at, timeZone, { hour: "2-digit", minute: "2-digit" })}</span>
          </Link>)}
          {recentFinalized.length === 0 ? <p className={styles.emptyLane}>Nenhum pedido finalizado nas últimas {recentFinalizedWindowMinutes / 60} horas.</p> : null}
        </div>
      </section>
    </section>
  );
}
