import { Button } from "@/components/ui/button";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { Card } from "@/components/ui/primitives";
import { MetaEmbeddedSignupCard } from "@/features/conversations/meta-embedded-signup-card";
import { saveConversationSettingsAction } from "@/features/conversations/settings-actions";
import { WhatsAppAutomationSettings } from "@/features/conversations/whatsapp-automation-settings";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK, DEFAULT_WHATSAPP_HANDOFF_MESSAGE, DEFAULT_WHATSAPP_UNKNOWN_MESSAGE } from "@/server/conversations/greeting";
import { MetaEmbeddedSignupService } from "@/server/conversations/meta-embedded-signup-service";
import { normalizeWhatsAppAutomationPreset } from "@/server/conversations/order-notification-model";
import { normalizeOrderNotificationCustomTemplates } from "@/server/conversations/order-notification-template";
import { ConversationSettingsService } from "@/server/conversations/settings-service";
import { resolveWhatsAppAutomationCapabilities } from "@/server/conversations/whatsapp-automation-capability";
import { WhatsAppAutomationCapabilityService } from "@/server/conversations/whatsapp-automation-capability-service";
import { WhatsAppOperationalHealthService } from "@/server/conversations/whatsapp-operational-health-service";
import type { WhatsAppOperationalHealthState, WhatsAppOperationalIssueCode } from "@/server/conversations/whatsapp-operational-health-model";
import { DEFAULT_CONVERSATION_AUTO_CLOSE_MESSAGE } from "@/server/conversations/conversation-lifecycle";

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


const HEALTH_STATE_LABELS: Record<WhatsAppOperationalHealthState, string> = {
  healthy: "Saudável",
  attention: "Atenção",
  action_required: "Ação necessária",
  provider_unavailable: "Meta temporariamente indisponível",
  disconnected: "Desconectado",
};

const HEALTH_ISSUE_LABELS: Record<WhatsAppOperationalIssueCode, string> = {
  connection_action_required: "A conexão precisa ser reautorizada pelo fluxo oficial.",
  connection_status_unknown: "O estado atual da conexão precisa ser conferido.",
  waba_subscription_not_confirmed: "A assinatura da conta WhatsApp ainda não foi confirmada.",
  app_webhook_not_confirmed: "O webhook do app Meta ainda não está confirmado.",
  ingest_failure_recent: "Houve uma falha recente ao processar evento recebido.",
  outbound_pending: "Existem mensagens de saída ainda pendentes.",
  outbound_failed_recent: "Houve falha recente em mensagem de saída.",
  media_processing_backlog: "Existem mídias ainda aguardando processamento.",
  media_failed_recent: "Houve falha recente no processamento de mídia.",
  history_sync_error: "O último processamento de histórico registrou erro.",
  state_sync_error: "O último state sync registrou erro.",
};

function healthWhen(value: string | null, timeZone: string) {
  if (!value) return "Sem registro";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value));
  } catch {
    return "Data indisponível";
  }
}

function healthGuidance(state: WhatsAppOperationalHealthState) {
  if (state === "healthy") return "Canal sem pendências operacionais detectadas.";
  if (state === "disconnected") return "O canal está desligado. Histórico e pedidos continuam preservados.";
  if (state === "provider_unavailable") return "A conexão local está preservada; aguarde a Meta estabilizar antes de reconectar.";
  if (state === "action_required") return "Use o fluxo oficial de reconexão. Não altere token, WABA ou número diretamente.";
  return "Revise os itens abaixo. O núcleo de pedidos continua independente do WhatsApp.";
}

export default async function ConversationSettingsPage() {
  await authorize(PERMISSIONS.INTEGRATIONS_MANAGE);
  const platformConfig = MetaEmbeddedSignupService.publicConfig();
  const [settings, embeddedStatus, structural] = await Promise.all([
    ConversationSettingsService.load(),
    MetaEmbeddedSignupService.currentStatus(),
    WhatsAppAutomationCapabilityService.loadCurrentStore(),
  ]);
  const operationalHealth = await WhatsAppOperationalHealthService.load();
  const connectionConfigured = Boolean(settings?.whatsapp_phone_number_id && settings?.access_token_secret_ref && settings?.app_secret_secret_ref);
  const orderTemplateConfigured = Boolean(settings?.order_notification_template_name);
  const preset = normalizeWhatsAppAutomationPreset(settings?.order_notification_preset);
  const customTemplates = normalizeOrderNotificationCustomTemplates(settings?.order_notification_custom_templates);
  const preferences = {
    order_received: settings?.notify_order_received ?? true,
    order_confirmed: Boolean(settings?.notify_order_confirmed),
    production_preparing: Boolean(settings?.notify_production_preparing),
    payment_paid: Boolean(settings?.notify_payment_paid),
    pickup_ready: settings?.notify_pickup_ready ?? true,
    pickup_completed: Boolean(settings?.notify_pickup_completed),
    out_for_delivery: settings?.notify_out_for_delivery ?? true,
    delivered: Boolean(settings?.notify_delivered),
    order_canceled: Boolean(settings?.notify_order_canceled),
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
    workflowEligibility: structural.workflowEligibility,
  });

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 880 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Atendimento</p>
        <h1 style={{ margin: "4px 0" }}>Conversas e WhatsApp</h1>
        <p className="muted" style={{ margin: 0 }}>Conecte o WhatsApp da loja, continue atendendo pelo celular se quiser e escolha como o PedeAqui conversa com seus clientes.</p>
      </header>

      <MetaEmbeddedSignupCard status={embeddedStatus} platformReady={platformConfig.ready} />

      <Card style={{ display: "grid", gap: 12 }} aria-labelledby="whatsapp-health-title">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>DIAGNÓSTICO OPERACIONAL</p>
            <h2 id="whatsapp-health-title" style={{ margin: "3px 0 0", fontSize: 18 }}>Saúde do WhatsApp</h2>
          </div>
          <strong style={{ fontSize: 13 }}>{HEALTH_STATE_LABELS[operationalHealth.state]}</strong>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{healthGuidance(operationalHealth.state)}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong style={{ display: "block", fontSize: 12 }}>Conexão</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {operationalHealth.connection.enabled ? (operationalHealth.connection.status === "connected" ? "Conectada" : "Requer atenção") : "Desligada"}
              {operationalHealth.connection.mode === "coexistence" ? " · Coexistência" : operationalHealth.connection.mode === "cloud_api" ? " · Cloud API" : ""}
            </span>
          </div>
          <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong style={{ display: "block", fontSize: 12 }}>Webhook</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {operationalHealth.connection.mode === "coexistence"
                ? operationalHealth.webhook.subscriptionStatus === "subscribed" && operationalHealth.webhook.appWebhookStatus === "subscribed" ? "Assinaturas confirmadas" : "Confirmação pendente/revisar"
                : "Monitorado pelo canal oficial"}
            </span>
          </div>
          <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong style={{ display: "block", fontSize: 12 }}>Último inbound</strong>
            <span className="muted" style={{ fontSize: 12 }}>{healthWhen(operationalHealth.activity.lastInboundAt, operationalHealth.timezone)}</span>
          </div>
          {operationalHealth.connection.mode === "coexistence" ? <div style={{ padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
            <strong style={{ display: "block", fontSize: 12 }}>Último echo do Business App</strong>
            <span className="muted" style={{ fontSize: 12 }}>{healthWhen(operationalHealth.webhook.lastEchoPersistedAt ?? operationalHealth.webhook.lastEchoWebhookAt, operationalHealth.timezone)}</span>
          </div> : null}
        </div>

        <div style={{ display: "grid", gap: 4, padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
          <strong style={{ fontSize: 12 }}>Filas e atendimento</strong>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {operationalHealth.queues.outboundPending} mensagem(ns) pendente(s) · {operationalHealth.queues.mediaPending} mídia(s) em processamento · {operationalHealth.activity.waitingAgentCount} aguardando atendente
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Janela de falhas recentes: {operationalHealth.recentFailureWindowHours}h · {operationalHealth.queues.outboundFailedRecent} envio(s) falho(s) · {operationalHealth.queues.mediaFailedRecent} mídia(s) falha(s)
          </p>
        </div>

        {operationalHealth.issues.length > 0 ? <div style={{ display: "grid", gap: 5 }}>
          <strong style={{ fontSize: 12 }}>Itens para verificar</strong>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
            {operationalHealth.issues.map((issue) => <li key={issue} className="muted" style={{ fontSize: 12 }}>{HEALTH_ISSUE_LABELS[issue]}</li>)}
          </ul>
        </div> : <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Nenhuma pendência operacional detectada.</p>}

        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Este diagnóstico não mostra mensagens, telefones, endereços, tokens ou identificadores técnicos da conta Meta.
        </p>
      </Card>

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
            <h2 style={{ margin: 0, fontSize: 18 }}>Avisos do andamento do pedido</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Escolha um fluxo pronto ou personalize as etapas e textos. Os avisos são sincronizados com o fluxo de pedidos da unidade, disparados somente por estados reais e nunca mudam o andamento do pedido.</p>
          </div>

          <WhatsAppAutomationSettings
            connected={connectionConfigured}
            enabled={Boolean(settings?.order_notifications_enabled)}
            preset={preset}
            capabilities={capabilities}
            customTemplates={customTemplates}
            defaults={{
              notifyOrderReceived: preferences.order_received,
              notifyOrderConfirmed: preferences.order_confirmed,
              notifyProductionPreparing: preferences.production_preparing,
              notifyPaymentPaid: preferences.payment_paid,
              notifyPickupReady: preferences.pickup_ready,
              notifyPickupCompleted: preferences.pickup_completed,
              notifyOutForDelivery: preferences.out_for_delivery,
              notifyDelivered: preferences.delivered,
              notifyOrderCanceled: preferences.order_canceled,
            }}
          />

          <div style={{ display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
            <strong>Sincronizado com o fluxo de pedidos ✓</strong>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Etapas ocultas no fluxo Completo, Simplificado ou Personalizado não são anunciadas ao cliente. As preferências ficam guardadas caso a etapa volte a ser usada.</p>
          </div>

          <div style={{ display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
            <strong>Envio seguro pelo WhatsApp</strong>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              {orderTemplateConfigured
                ? "O modelo aprovado está configurado para avisos que precisem ser enviados fora da janela de atendimento."
                : "Dentro da janela aberta pelo cliente, os avisos podem seguir normalmente. Para avisos fora dela, é necessário ter um modelo de mensagem aprovado pelo WhatsApp."}
            </p>
            {!orderTemplateConfigured && connectionConfigured ? <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Modelo para avisos fora da janela: pendente.</p> : null}
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Se o WhatsApp, um módulo, o plano ou um modelo ficarem indisponíveis, a automação é suspensa sem apagar a preferência nem o texto personalizado. O pedido continua funcionando normalmente.</p>
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
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Mensagem inicial e menu</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Escolha se o atendimento começa como conversa, mostra as opções imediatamente ou oferece um botão.</p>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Como apresentar as opções</span>
            <select name="botMenuMode" defaultValue={settings?.bot_menu_mode ?? "conversation_first"} style={fieldStyle}>
              <option value="conversation_first">Conversa limpa + cliente digita “menu” (recomendado)</option>
              <option value="interactive">Conversa limpa + botão “Ver opções”</option>
              <option value="menu_first">Mostrar todas as opções logo no início</option>
            </select>
            <span className="muted" style={{ fontSize: 12 }}>Mesmo no modo com botão, o cliente sempre pode digitar <strong>menu</strong>. Se a Meta não aceitar o botão, o PedeAqui envia a alternativa em texto.</span>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Nome do robô <span className="muted">(opcional)</span></span>
            <input name="botDisplayName" defaultValue={settings?.bot_display_name ?? ""} maxLength={60} placeholder="Ex.: Maria" style={fieldStyle} />
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}><input type="checkbox" name="greetingEnabled" defaultChecked={Boolean(settings?.greeting_enabled)} disabled={!connectionConfigured} /><span>Enviar uma saudação no primeiro contato</span></label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Mensagem enviada ao cliente</span>
            <textarea name="greetingTemplate" defaultValue={greetingForEditor(settings?.greeting_template ?? DEFAULT_WHATSAPP_GREETING)} style={textareaStyle} />
            <span className="muted" style={{ fontSize: 12 }}>O PedeAqui troca <strong>[nome do restaurante]</strong> e, quando usado, <strong>[link do cardápio]</strong> pelos dados corretos da unidade. O link é obrigatório apenas quando todas as opções aparecem logo no início.</span>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Mensagem quando o cardápio estiver indisponível</span>
            <textarea name="greetingFallbackMessage" defaultValue={settings?.greeting_fallback_message ?? DEFAULT_WHATSAPP_GREETING_FALLBACK} style={textareaStyle} />
            <span className="muted" style={{ fontSize: 12 }}>Quando não for possível direcionar o cliente ao cardápio, esta mensagem mantém o contato com a equipe.</span>
          </label>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Pedido pelo WhatsApp</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
            <input type="checkbox" name="whatsappOrdersEnabled" defaultChecked={Boolean(settings?.whatsapp_orders_enabled)} disabled={!connectionConfigured} style={{ marginTop: 3 }} />
            <span>
              <strong>Aceitar pedidos pelo WhatsApp</strong>
              <span className="muted" style={{ display: "block", fontSize: 12, marginTop: 3 }}>O robô monta o carrinho, pergunta entrega ou retirada e pagamento, e confirma tudo antes de criar o pedido.</span>
            </span>
          </label>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Transferência e ajuda</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Defina como o robô responde quando o cliente pede uma pessoa ou quando não entende a mensagem.</p>
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Ao chamar um atendente</span>
            <textarea name="handoffMessage" defaultValue={settings?.handoff_message ?? DEFAULT_WHATSAPP_HANDOFF_MESSAGE} style={textareaStyle} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Quando não entender</span>
            <textarea name="unknownMessage" defaultValue={settings?.unknown_intent_message ?? DEFAULT_WHATSAPP_UNKNOWN_MESSAGE} style={textareaStyle} />
          </label>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Encerramento das conversas</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>A própria loja escolhe quando um atendimento sem novas mensagens deve ser encerrado.</p>
          </div>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="conversationAutoCloseEnabled" defaultChecked={Boolean(settings?.conversation_auto_close_enabled)} />
            <span>Encerrar conversas automaticamente por inatividade</span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Conversa com o robô</span>
              <input type="number" name="botAutoCloseMinutes" min={5} max={1440} step={1} defaultValue={settings?.bot_auto_close_minutes ?? 30} style={fieldStyle} />
              <span className="muted" style={{ fontSize: 12 }}>Tempo em minutos. Exemplos: 15, 30, 60 ou 120.</span>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Atendimento humano</span>
              <input type="number" name="humanAutoCloseMinutes" min={5} max={1440} step={1} defaultValue={settings?.human_auto_close_minutes ?? 60} style={fieldStyle} />
              <span className="muted" style={{ fontSize: 12 }}>Pode ser diferente do tempo usado pelo robô.</span>
            </label>
          </div>
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <input type="checkbox" name="keepOpenWhileOrderActive" defaultChecked={settings?.keep_open_while_order_active ?? true} style={{ marginTop: 3 }} />
            <span><strong>Manter aberta enquanto houver pedido ativo</strong><span className="muted" style={{ display: "block", fontSize: 12, marginTop: 3 }}>Pedidos pendentes ou em andamento e pedidos ainda sendo montados pelo WhatsApp impedem o encerramento.</span></span>
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="sendAutoCloseMessage" defaultChecked={settings?.send_auto_close_message ?? true} />
            <span>Avisar o cliente antes de encerrar</span>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Mensagem de encerramento</span>
            <textarea name="autoCloseMessage" defaultValue={settings?.auto_close_message ?? DEFAULT_CONVERSATION_AUTO_CLOSE_MESSAGE} style={textareaStyle} />
            <span className="muted" style={{ fontSize: 12 }}>A tentativa de envio respeita a disponibilidade e a janela do WhatsApp. Se a Meta não permitir o envio, a conversa ainda é encerrada corretamente.</span>
          </label>
          <div style={{ display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}>
            <strong>Proteções automáticas</strong>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Conversas aguardando atendente nunca são encerradas por esta regra. Se o cliente voltar depois, uma nova conversa limpa é aberta sem apagar o histórico anterior.</p>
          </div>
        </Card>
        <div><Button type="submit">Salvar preferências</Button></div>
      </form>
    </section>
  );
}
