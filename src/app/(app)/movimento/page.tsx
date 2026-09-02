import Link from "next/link";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import { MovementMode } from "@/features/operations/movement-mode";
import { isManualDeliveryMode } from "@/modules/manual-delivery";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { OrderService } from "@/server/orders/order-service";
import { OperationalHealthService } from "@/server/operations/operational-health-service";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import styles from "./movimento.module.css";

export default async function MovementPage() {
  const [ordersData, modules, access] = await Promise.all([OrderService.list(), ModuleAccessService.load(), NavigationAccessService.load()]);
  if (!ordersData.context.storeId) throw new Error("Selecione uma unidade.");
  const health = await OperationalHealthService.load(access);
  return <section className={styles.page}>
    <header><div><p>HORÁRIO DE PICO</p><h1>Modo Movimento</h1><span>Uma fila, uma próxima ação por pendência. O PedeAqui organiza; sua equipe executa.</span></div><Link href="/pedidos">Ver quadro completo</Link></header>
    <MovementMode storeId={ordersData.context.storeId} initialOrders={ordersData.orders as OrderManagerRow[]} workflowMode={ordersData.workflowMode} manualDeliveryMode={isManualDeliveryMode(modules.enabledModuleKeys, ordersData.deliveryOperationLevel)} healthIssues={health.issues.filter((issue) => issue.severity === "P0" || issue.severity === "P1")} />
  </section>;
}
