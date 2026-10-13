import styles from "../settings-form.module.css";
import { OrderWorkflowSettingsForm } from "@/features/orders/order-workflow-settings-form";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";

export default async function OrderWorkflowSettingsPage() {
  const { settings } = await OrderWorkflowSettingsService.get();

  return <section className={styles.page}>
    <header className={styles.header}>
      <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Configurações · Operação</p>
      <h1 style={{ margin: "4px 0" }}>Fluxo de pedidos</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 760 }}>Escolha quantas etapas aparecem para a equipe. No modo personalizado, entrega e retirada podem ter checkpoints diferentes sem alterar as regras internas do pedido.</p>
    </header>
    <OrderWorkflowSettingsForm mode={settings.mode} custom={settings.custom} />
  </section>;
}
