import Link from "next/link";
import { OrderManagerBoard } from "@/features/orders/order-manager-board";
import styles from "@/features/orders/order-manager.module.css";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import { OrderService } from "@/server/orders/order-service";

export default async function OrdersPage() {
  const { context, orders, workflowMode } = await OrderService.list(200);
  if (!context.storeId) throw new Error("An active store is required");

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <p className={styles.pageEyebrow}>Operação em tempo real</p>
          <h1>Pedidos</h1>
          <p className={styles.pageHint}>
            {workflowMode === "simplified"
              ? "Acompanhe somente os pedidos em andamento. Ao finalizar, o pedido sai deste quadro e vai para o histórico."
              : "Acompanhe os pedidos ativos por prioridade e consulte finalizados, cancelados e recusados no histórico."}
          </p>
        </div>
        {workflowMode === "simplified"
          ? <Link href="/pedidos/historico" className={styles.detailsLink}>Ver histórico</Link>
          : <p className={styles.pageHint}>A tela é atualizada automaticamente enquanto a operação estiver aberta.</p>}
      </header>

      <OrderManagerBoard storeId={context.storeId} orders={orders as OrderManagerRow[]} workflowMode={workflowMode} />
    </section>
  );
}
