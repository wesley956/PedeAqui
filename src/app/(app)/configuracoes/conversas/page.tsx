import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { saveConversationSettingsAction } from "@/features/conversations/settings-actions";
import { ConversationSettingsService } from "@/server/conversations/settings-service";

const fieldStyle = {
  minHeight: 44,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "10px 12px",
  width: "100%",
} as const;

export default async function ConversationSettingsPage() {
  const settings = await ConversationSettingsService.load();

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 880 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Integrações de atendimento</p>
        <h1 style={{ margin: "4px 0" }}>Conversas e WhatsApp</h1>
        <p className="muted" style={{ margin: 0 }}>A aplicação salva apenas nomes de variáveis de ambiente para os segredos. Tokens e App Secret nunca ficam expostos no navegador.</p>
      </header>

      <form action={saveConversationSettingsAction} style={{ display: "grid", gap: 14 }}>
        <Card style={{ display: "grid", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>WhatsApp Cloud API</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="whatsappEnabled" defaultChecked={Boolean(settings?.whatsapp_enabled)} />
            <span>Habilitar WhatsApp nesta unidade</span>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Phone Number ID</span>
              <input name="phoneNumberId" defaultValue={settings?.whatsapp_phone_number_id ?? ""} placeholder="ID fornecido pelo provider" style={fieldStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Business Account ID</span>
              <input name="businessAccountId" defaultValue={settings?.whatsapp_business_account_id ?? ""} placeholder="Opcional" style={fieldStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Variável do access token</span>
              <input name="accessTokenSecretRef" defaultValue={settings?.access_token_secret_ref ?? "WHATSAPP_ACCESS_TOKEN"} placeholder="WHATSAPP_ACCESS_TOKEN" style={fieldStyle} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Variável do App Secret</span>
              <input name="appSecretSecretRef" defaultValue={settings?.app_secret_secret_ref ?? "WHATSAPP_APP_SECRET"} placeholder="WHATSAPP_APP_SECRET" style={fieldStyle} />
            </label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Também configure <code>WHATSAPP_WEBHOOK_VERIFY_TOKEN</code> e <code>WHATSAPP_GRAPH_API_VERSION</code> no ambiente do servidor.</p>
        </Card>

        <Card style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Automação</h2>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="botEnabled" defaultChecked={settings?.default_bot_enabled ?? true} />
            <span>Bot habilitado por padrão</span>
          </label>
          <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <input type="checkbox" name="aiEnabled" defaultChecked={Boolean(settings?.ai_enabled)} />
            <span>Permitir IA através da allowlist de ferramentas</span>
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>A IA não recebe acesso SQL nem service role. Cada ferramenta executa autorização e escopo próprios.</p>
        </Card>

        <div><Button type="submit">Salvar configurações</Button></div>
      </form>
    </section>
  );
}
