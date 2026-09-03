import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { MetaEmbeddedSignupCard } from "@/features/conversations/meta-embedded-signup-card";
import { saveConversationSettingsAction } from "@/features/conversations/settings-actions";
import { WhatsAppAutomationSettings } from "@/features/conversations/whatsapp-automation-settings";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK } from "@/server/conversations/greeting";
import { MetaEmbeddedSignupService } from "@/server/conversations/meta-embedded-signup-service";
import { normalizeWhatsAppAutomationPreset } from "@/server/conversations/order-notification-model";
import { ConversationSettingsService } from "@/server/conversations/settings-service";
import { resolveWhatsAppAutomationCapabilities } from "@/server/conversations/whatsapp-automation-capability";
import { WhatsAppAutomationCapabilityService } from "@/server/conversations/whatsapp-automation-capability-service";

const fieldStyle = {
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
  width: "100%",
} as const;
const textareaStyle = { ...fieldStyle, minHeight: 108, resize: "vertical" as const };

function greetingForEditor(value: string) {
  return value.replaceAll("{restaurante}", "[nome do restaurante]").replaceAll("{link}", "[link do cardápio]");
}

export default async function ConversationSettingsPage() {
  const platformConfig = MetaEmbeddedSignupService.publicConfig();
  const [settings, embeddedStatus, structural] = await Promise.all([
    ConversationSettingsService.load(),
    MetaEmbeddedSignupService.currentStatus(),
    WhatsAppAutomationCapabilityService.loadCurrentStore(),
  ]);
  const connectionConfigured = Boolean(settings?.whatsapp_phone_number_id && settings?.access_token_secret_ref && settings?.app_secret_secret_ref);
  const orderTemplateConfigured = Boolean(settings?.order_notification_template_name);
  const preset = normalizeWhatsAppAutomationPreset(settings?.order_notification_preset);
  const preferences = {
    order_received: settings?.notify_order_received ?? true,
    order_confirmed: Boolean(settings?.notify_order_confirmed),
    production_preparing: Boolean(settings?.notify_production_preparing),
    payment_paid: Boolean(settings?.notify_payment_paid),
    pickup_ready: settings?.notify_pickup_ready ?? true,
    pickup_completed: Boolean(settings?.notify_pickup_completed),
    out_for_delivery: settings?.notify_out_for_delivery ?? true,
    delivered: Boolean(settings?.notify_delivered),
  } as const;
  const capabilities = resolveWhatsAppAutomationCapabilities({
    businessType: structural.businessType,
    modules: structural.modules,
    channel: {
      configured: connectionConfigured,
      enabled: Boolean(settings?.whatsapp_enabled),
      connectionStatus: embeddedStatus.connection_status,
    },
    orderNotificationsEnabled: Boolean(settings?.order_notifications_enabled),
    preferences,
    onlinePaymentReady: structural.onlinePaymentReady,
    deliveryOperationEnabled: structural.deliveryOperationEnabled,
  });

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 880 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Atendimento</p>
        <h1 style={{ margin: "4px 0" }}>Conversas e WhatsApp</h1>
        <p className="muted" style={{ margin: 0 }}>Conecte o WhatsApp da loja, continue atendendo pelo celular se quiser e escolha como o PedeAqui conversa com seus clientes.</p>
      </header>

      <MetaEmbeddedSignupCard status={embeddedStatus} platformReady={platformConfig.ready} />

      <form action={saveConversationSettingsAction} style={{ display: "grid", gap: 14 }}>
        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>WhatsApp da unidade</h2>
          {connectionConfigured ? <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="whatsappEnabled" defaultChecked={Boolean(settings?.whatsapp_enabled)} />
            <span>Usar este WhatsApp no atendimento</span>
          </label> : <p className="muted" style={{ margin: 0 }}>Use a área <strong>Conecte o WhatsApp da loja</strong> acima. Você autoriza o número e o PedeAqui cuida da configuração automaticamente.</p>}
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Automações do pedido</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Escolha um fluxo pronto ou personalize as etapas. Os avisos são disparados somente por estados reais do pedido no PedeAqui e nunca mudam o andamento do pedido.</p>
          </div>

          <WhatsAppAutomationSettings
            connected={connectionConfigured}
            enabled={Boolean(settings?.order_notifications_enabled)}
            preset={preset}
            capabilities={capabilities}
            defaults={{
              notifyOrderReceived: preferences.order_received,
              notifyOrderConfirmed: preferences.order_confirmed,
              notifyProductionPreparing: preferences.production_preparing,
              notifyPaymentPaid: preferences.payment_paid,
              notifyPickupReady: preferences.pickup_ready,
              notifyPickupCompleted: preferences.pickup_completed,
              notifyOutForDelivery: preferences.out_for_delivery,
              notifyDelivered: preferences.delivered,
            }}
          />

          <div style={{ display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
            <strong>Envio seguro pelo WhatsApp</strong>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {orderTemplateConfigured
                ? "O modelo aprovado está configurado para avisos que precisem ser enviados fora da janela de atendimento."
                : "Dentro da janela aberta pelo cliente, os avisos podem seguir normalmente. Para avisos fora dela, é necessário ter um modelo de mensagem aprovado pelo WhatsApp."}
            </p>
            {!orderTemplateConfigured && connectionConfigured ? <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Modelo para avisos fora da janela: pendente.</p> : null}
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Se o WhatsApp, um módulo, o plano ou um modelo ficarem indisponíveis, a automação é suspensa sem apagar a preferência. O pedido continua funcionando normalmente.</p>
          </div>
          <input type="hidden" name="orderNotificationTemplateName" value={settings?.order_notification_template_name ?? ""} />
          <input type="hidden" name="orderNotificationTemplateLanguage" value={settings?.order_notification_template_language ?? "pt_BR"} />
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Eventos já ignorados durante uma suspensão não são reenviados retroativamente quando a capability volta.</p>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Atendimento automático</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="botEnabled" defaultChecked={settings?.default_bot_enabled ?? true} /><span>Responder automaticamente quando não houver atendente</span></label>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="aiEnabled" defaultChecked={Boolean(settings?.ai_enabled)} /><span>Usar o assistente inteligente nas conversas</span></label>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>O assistente só utiliza as funções autorizadas do PedeAqui e respeita o acesso configurado para esta unidade.</p>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Mensagem de boas-vindas</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="greetingEnabled" defaultChecked={Boolean(settings?.greeting_enabled)} disabled={!connectionConfigured} /><span>Enviar uma saudação no primeiro contato e apresentar o cardápio</span></label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Mensagem enviada ao cliente</span>
            <textarea name="greetingTemplate" defaultValue={greetingForEditor(settings?.greeting_template ?? DEFAULT_WHATSAPP_GREETING)} style={textareaStyle} />
            <span className="muted" style={{ fontSize: 12 }}>Você pode editar o texto. Mantenha <strong>[link do cardápio]</strong>; o PedeAqui troca automaticamente <strong>[nome do restaurante]</strong> e o link pelos dados corretos da unidade.</span>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Mensagem quando o cardápio estiver indisponível</span>
            <textarea name="greetingFallbackMessage" defaultValue={settings?.greeting_fallback_message ?? DEFAULT_WHATSAPP_GREETING_FALLBACK} style={textareaStyle} />
            <span className="muted" style={{ fontSize: 12 }}>Quando não for possível direcionar o cliente ao cardápio, esta mensagem mantém o contato com a equipe.</span>
          </label>
        </Card>
        <div><Button type="submit">Salvar preferências</Button></div>
      </form>
    </section>
  );
}
