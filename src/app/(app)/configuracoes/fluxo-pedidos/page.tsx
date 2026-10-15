import styles from "../settings-form.module.css";
import { OrderWorkflowSettingsForm } from "@/features/orders/order-workflow-settings-form";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";
import { PageHeader } from "@/components/ui/page-header";

export default async function OrderWorkflowSettingsPage() {
  const { settings } = await OrderWorkflowSettingsService.get();

  return <section className={styles.page}>
    <PageHeader title="Fluxo de pedidos" description="Escolha quantas etapas aparecem para a equipe. No modo personalizado, entrega e retirada podem ter checkpoints diferentes sem alterar as regras internas do pedido." />
    <OrderWorkflowSettingsForm mode={settings.mode} custom={settings.custom} receptionMode={settings.receptionMode} />
  </section>;
}
