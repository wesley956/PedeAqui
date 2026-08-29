import Link from "next/link";
import { CustomOrderWorkflowBoard } from "@/features/orders/custom-order-workflow-board";
import { OrderManagerBoard } from "@/features/orders/order-manager-board";
import styles from "@/features/orders/order-manager.module.css";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import { OrderService } from "@/server/orders/order-service";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";

export default async function OrdersPage() {
  const [{ context, orders, workflowMode: legacyWorkflowMode }, { settings }] = await Promise.all([
    OrderService.list(200),
    OrderWorkflowSettingsService.get(),
  ]);
  if (!context.storeId) throw new Error("An active store is required");
  const workflowMode = settings.mode === "custom" ? "custom" : legacyWorkflowMode;
  const rows = orders as OrderManagerRow[];
  const activeCount = rows.filter((order) => !["delivered", "canceled", "rejected"].includes(order.status)).length;

  return (
    <section className={styles.page}>
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
          ? "Fluxo simplificado: Iniciar → Pronto → Finalizados."
          : workflowMode === "custom"
            ? "O quadro segue os checkpoints definidos em Configurações."
            : "A tela atualiza automaticamente enquanto a operação estiver aberta."}
      </div>

      {workflowMode === "custom"
        ? <CustomOrderWorkflowBoard storeId={context.storeId} orders={rows} config={settings.custom} />
        : <OrderManagerBoard storeId={context.storeId} orders={rows} workflowMode={workflowMode} />}
    </section>
  );
}
