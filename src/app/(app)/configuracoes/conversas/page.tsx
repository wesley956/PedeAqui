import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { saveConversationSettingsAction } from "@/features/conversations/settings-actions";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK } from "@/server/conversations/greeting";
import { ConversationSettingsService, type WhatsAppChannelHealth } from "@/server/conversations/settings-service";

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

const healthLabels: Record<WhatsAppChannelHealth["status"], string> = {
  disabled: "Desativado",
  misconfigured: "Ação necessária",
  connected: "Conectado",
  provider_unavailable: "Indisponível no momento",
  invalid_credentials: "Reconexão necessária",
};

const qualityLabels: Record<string, string> = {
  GREEN: "Boa",
  YELLOW: "Atenção",
  RED: "Crítica",
  UNKNOWN: "Não informada",
};

function greetingForEditor(value: string) {
  return value
    .replaceAll("{restaurante}", "[nome do restaurante]")
    .replaceAll("{link}", "[link do cardápio]");
}

export default async function ConversationSettingsPage() {
  const [settings, health] = await Promise.all([
    ConversationSettingsService.load(),
    ConversationSettingsService.health(),
  ]);
  const connectionConfigured = Boolean(
    settings?.whatsapp_phone_number_id && settings?.access_token_secret_ref && settings?.app_secret_secret_ref,
  );

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 880 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Atendimento</p>
        <h1 style={{ margin: "4px 0" }}>Conversas e WhatsApp</h1>
        <p className="muted" style={{ margin: 0 }}>Acompanhe a conexão do WhatsApp e escolha como o PedeAqui conversa com seus clientes.</p>
      </header>

      <Card style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Situação do WhatsApp</p>
            <strong>{healthLabels[health.status]}</strong>
          </div>
          {health.status === "connected" ? <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>Pronto para atender</span> : null}
        </div>
        <p style={{ margin: 0 }}>{health.message}</p>
        {health.status === "connected" ? <div className="muted" style={{ display: "grid", gap: 3, fontSize: 13 }}>
          {health.verifiedName ? <span>Nome da empresa: <strong>{health.verifiedName}</strong></span> : null}
          {health.displayPhoneNumber ? <span>Número conectado: <strong>{health.displayPhoneNumber}</strong></span> : null}
          {health.qualityRating ? <span>Qualidade da conta: <strong>{qualityLabels[health.qualityRating] ?? "Disponível"}</strong></span> : null}
        </div> : null}
        {!connectionConfigured ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Este WhatsApp ainda não foi conectado. A ativação pode ser feita com o suporte do PedeAqui; o fluxo guiado de conexão ficará disponível nesta própria tela.</p> : null}
      </Card>

      <form action={saveConversationSettingsAction} style={{ display: "grid", gap: 14 }}>
        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>WhatsApp da unidade</h2>
          {connectionConfigured ? <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="whatsappEnabled" defaultChecked={Boolean(settings?.whatsapp_enabled)} />
            <span>Usar este WhatsApp no atendimento</span>
          </label> : <p className="muted" style={{ margin: 0 }}>Conecte o WhatsApp antes de ativar o atendimento por este canal.</p>}
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Atualizações automáticas do pedido</h2>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>O PedeAqui avisa o cliente no WhatsApp sem alterar o andamento do pedido. Se a Meta estiver indisponível, a operação do restaurante continua normalmente.</p>
          </div>
          <label style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700 }}>
            <input type="checkbox" name="orderNotificationsEnabled" defaultChecked={Boolean(settings?.order_notifications_enabled)} disabled={!connectionConfigured} />
            <span>Enviar atualizações do pedido pelo WhatsApp</span>
          </label>
          <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <input type="checkbox" name="notifyOrderReceived" defaultChecked={settings?.notify_order_received ?? true} disabled={!connectionConfigured} />
              <span>Pedido recebido + link de acompanhamento</span>
            </label>
            <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <input type="checkbox" name="notifyPaymentPaid" defaultChecked={Boolean(settings?.notify_payment_paid)} disabled={!connectionConfigured} />
              <span>Pagamento confirmado</span>
            </label>
            <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <input type="checkbox" name="notifyPickupReady" defaultChecked={settings?.notify_pickup_ready ?? true} disabled={!connectionConfigured} />
              <span>Pronto para retirada</span>
            </label>
            <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <input type="checkbox" name="notifyOutForDelivery" defaultChecked={settings?.notify_out_for_delivery ?? true} disabled={!connectionConfigured} />
              <span>Saiu para entrega</span>
            </label>
            <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
              <input type="checkbox" name="notifyDelivered" defaultChecked={Boolean(settings?.notify_delivered)} disabled={!connectionConfigured} />
              <span>Pedido entregue</span>
            </label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Cada aviso possui uma chave única por pedido. Reprocessamentos e eventos repetidos não criam uma segunda mensagem local.</p>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Atendimento automático</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="botEnabled" defaultChecked={settings?.default_bot_enabled ?? true} />
            <span>Responder automaticamente quando não houver atendente</span>
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="aiEnabled" defaultChecked={Boolean(settings?.ai_enabled)} />
            <span>Usar o assistente inteligente nas conversas</span>
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>O assistente só utiliza as funções autorizadas do PedeAqui e respeita o acesso configurado para esta unidade.</p>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Mensagem de boas-vindas</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="greetingEnabled" defaultChecked={Boolean(settings?.greeting_enabled)} disabled={!connectionConfigured} />
            <span>Enviar uma saudação no primeiro contato e apresentar o cardápio</span>
          </label>
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
