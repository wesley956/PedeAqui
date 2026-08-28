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

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <p className={styles.pageEyebrow}>Operação em tempo real</p>
          <h1>Pedidos</h1>
          <p className={styles.pageHint}>
            {workflowMode === "simplified"
              ? "Iniciar → Pronto → Finalizados. Ao iniciar a rota, o pedido vai para Finalizados aguardando a confirmação da entrega. Depois de entregue e liquidado, sai do quadro e fica no histórico."
              : workflowMode === "custom"
                ? "O quadro segue os checkpoints escolhidos em Configurações. Etapas ocultas continuam protegidas pelas regras internas do pedido."
                : "Acompanhe os pedidos ativos por prioridade e consulte finalizados, cancelados e recusados no histórico."}
          </p>
        </div>
        {workflowMode !== "standard"
          ? <Link href="/pedidos/historico" className={styles.detailsLink}>Ver histórico</Link>
          : <p className={styles.pageHint}>A tela é atualizada automaticamente enquanto a operação estiver aberta.</p>}
      </header>

      {workflowMode === "custom"
        ? <CustomOrderWorkflowBoard storeId={context.storeId} orders={rows} config={settings.custom} />
        : <OrderManagerBoard storeId={context.storeId} orders={rows} workflowMode={workflowMode} />}
    </section>
  );
}
