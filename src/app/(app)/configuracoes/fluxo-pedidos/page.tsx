import { OrderWorkflowSettingsForm } from "@/features/orders/order-workflow-settings-form";
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";

export default async function OrderWorkflowSettingsPage() {
  const { settings } = await OrderWorkflowSettingsService.get();

  return <section style={{ display: "grid", gap: 20, maxWidth: 1050 }}>
    <header>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações · Operação</p>
      <h1 style={{ margin: "4px 0" }}>Fluxo de pedidos</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 760 }}>Escolha quantas etapas aparecem para a equipe. No modo personalizado, entrega e retirada podem ter checkpoints diferentes sem alterar as regras internas do pedido.</p>
    </header>
    <OrderWorkflowSettingsForm mode={settings.mode} custom={settings.custom} />
  </section>;
}
