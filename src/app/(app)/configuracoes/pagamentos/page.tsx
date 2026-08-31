import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import buttonStyles from "@/components/ui/button.module.css";
import {
  disconnectMercadoPagoOAuthAction,
  saveOnlinePixProviderAction,
  savePaymentMethodsAction,
  toggleOnlinePixProviderAction,
} from "@/features/payments/actions";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { isMercadoPagoOAuthConfigured } from "@/server/payments/providers/mercado-pago-oauth";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";

const paymentHints: Record<string, string> = {
  cash: "O cliente pode informar se precisa de troco.",
  pix: "No cardápio público, o Pix só aparece quando o Pix online abaixo estiver configurado e ativo.",
  credit_card: "O cliente pode escolher cartão de crédito para pagar conforme a operação da unidade.",
  debit_card: "O cliente pode escolher cartão de débito para pagar conforme a operação da unidade.",
};

const mercadoPagoStatusMessages: Record<string, string> = {
  connected: "Mercado Pago conectado com sucesso. O Pix continua desligado até você ativá-lo nesta unidade.",
  authorization_denied: "A autorização foi cancelada no Mercado Pago. Você pode tentar conectar novamente.",
  oauth_error: "Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.",
  not_authorized: "Sua sessão não tem permissão para gerenciar os pagamentos desta unidade.",
  store_required: "Selecione uma unidade antes de conectar o Mercado Pago.",
  setup_required: "O servidor ainda não reconheceu todas as configurações necessárias do Mercado Pago.",
};

type PaymentSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaymentSettingsPage({ searchParams }: PaymentSettingsPageProps) {
  const [params, methods, providerResult, requestHeaders] = await Promise.all([
    searchParams,
    StorePaymentMethodService.listCurrentStore(),
    OrderPaymentProviderConfigService.getCurrentStore(),
    headers(),
  ]);
  const config = providerResult.config;
  const storeId = providerResult.context.storeId!;
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const webhookPath = `/api/webhooks/payments/mercado-pago/${storeId}`;
  const webhookUrl = host ? `${protocol}://${host}${webhookPath}` : webhookPath;
  const oauthAvailable = isMercadoPagoOAuthConfigured();
  const oauthConnected = Boolean(config?.connectionMode === "oauth" && config.credentialsConfigured && !config.revokedAt);
  const mercadoPagoStatusParam = params.mercado_pago;
  const mercadoPagoStatus = Array.isArray(mercadoPagoStatusParam) ? mercadoPagoStatusParam[0] : mercadoPagoStatusParam;
  const mercadoPagoMessage = mercadoPagoStatus ? mercadoPagoStatusMessages[mercadoPagoStatus] : null;
  const statusText = !config?.credentialsConfigured
    ? "Ainda não conectado"
    : config.enabled
      ? "Conectado e Pix ativo"
      : "Conectado, Pix desativado";
  const accountLabel = config?.providerAccountId
    ? `Conta Mercado Pago ••••${config.providerAccountId.slice(-4)}`
    : "Conta Mercado Pago conectada";

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 820 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Formas de pagamento</h1>
        <p className="muted" style={{ margin: 0 }}>Defina as opções do cliente e conecte o Pix online da unidade.</p>
      </header>

      {mercadoPagoMessage ? (
        <div
          role={mercadoPagoStatus === "connected" ? "status" : "alert"}
          className="card"
          style={{ padding: 14 }}
        >
          {mercadoPagoMessage}
        </div>
      ) : null}

      <form action={savePaymentMethodsAction} className="card" style={{ padding: 20, display: "grid", gap: 12 }}>
        <div>
          <strong>Opções aceitas pela unidade</strong>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>Cartões e dinheiro seguem a operação local. O Pix público depende da conexão online configurada abaixo.</p>
        </div>
        {methods.map((item) => (
          <label key={item.method} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" }}>
            <div>
              <strong>{paymentMethodLabels[item.method]}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{paymentHints[item.method]}</div>
            </div>
            <input type="checkbox" name="method" value={item.method} defaultChecked={item.enabled} aria-label={`Ativar ${paymentMethodLabels[item.method]}`} />
          </label>
        ))}
        <div style={{ marginTop: 8 }}><Button type="submit">Salvar formas de pagamento</Button></div>
      </form>

      <div className="card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Pix online</p>
            <h2 style={{ margin: "4px 0", fontSize: 20 }}>Mercado Pago</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>A conta do restaurante recebe o pagamento. O PedeAqui gera o QR e confirma pelo webhook.</p>
          </div>
          <strong style={{ fontSize: 13 }}>{statusText}</strong>
        </div>

        {oauthConnected ? (
          <>
            <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", gap: 5 }}>
              <strong>{accountLabel}</strong>
              <span className="muted" style={{ fontSize: 12 }}>Conexão OAuth autorizada. Credenciais ficam somente no servidor.</span>
              {config?.authorizedAt ? <span className="muted" style={{ fontSize: 12 }}>Autorizada em {new Date(config.authorizedAt).toLocaleString("pt-BR")}</span> : null}
            </div>

            <form action={toggleOnlinePixProviderAction} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
                <div>
                  <strong>Receber Pix automaticamente</strong>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Conectar a conta não ativa o Pix. A ativação é separada e vale só para esta unidade.</div>
                </div>
                <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} />
              </label>
              <div><Button type="submit">Salvar ativação do Pix</Button></div>
            </form>

            <form action={disconnectMercadoPagoOAuthAction}>
              <Button type="submit" tone="secondary">Desconectar Mercado Pago</Button>
            </form>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <strong>Conexão recomendada</strong>
              <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>O restaurante autoriza o PedeAqui no Mercado Pago sem copiar Access Token. A conexão começa com Pix desligado.</p>
            </div>
            {oauthAvailable ? (
              <a
                href="/api/integrations/mercado-pago/oauth/start"
                className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}
                style={{ width: "fit-content" }}
              >
                Conectar Mercado Pago
              </a>
            ) : (
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>A aplicação Mercado Pago do PedeAqui ainda precisa das credenciais globais e da Redirect URI no servidor para liberar este botão.</p>
            )}
          </div>
        )}

        <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <strong>URL do webhook desta unidade</strong>
          <p className="muted" style={{ margin: "5px 0 8px", fontSize: 12 }}>Endpoint que recebe eventos Order do Mercado Pago e reconcilia o pagamento antes de marcar como pago.</p>
          <code style={{ overflowWrap: "anywhere", fontSize: 12 }}>{webhookUrl}</code>
        </div>

        {config?.healthStatus === "error" && config.errorCode !== "oauth_disconnected" ? <p style={{ margin: 0 }}>A última verificação encontrou um problema. O Pix online fica isolado; dinheiro e cartões não dependem desta integração.</p> : null}
        {config?.healthStatus === "unknown" && config.credentialsConfigured ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Conexão armazenada. A homologação final exige um Pix real de baixo valor antes do rollout.</p> : null}

        {!oauthConnected ? (
          <details style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Configuração manual avançada</summary>
            <form action={saveOnlinePixProviderAction} style={{ display: "grid", gap: 14, marginTop: 14 }}>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>Compatibilidade temporária para configuração manual. Prefira OAuth para restaurantes clientes.</p>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
                <div><strong>Receber Pix automaticamente</strong><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Só ative depois de informar as credenciais.</div></div>
                <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Ambiente</span>
                <select name="environment" defaultValue={config?.environment ?? "production"}>
                  <option value="production">Produção</option>
                  <option value="test">Teste</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Access Token</span>
                <input type="password" name="accessToken" autoComplete="off" placeholder={config?.credentialsConfigured ? "Deixe em branco para manter o atual" : "Cole o Access Token do Mercado Pago"} />
                <span className="muted" style={{ fontSize: 12 }}>A credencial é enviada somente ao servidor e armazenada no Vault.</span>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600 }}>Chave secreta do webhook</span>
                <input type="password" name="webhookSecret" autoComplete="off" placeholder={config?.credentialsConfigured ? "Deixe em branco para manter a atual" : "Cole a assinatura secreta do webhook"} />
              </label>
              <div><Button type="submit">Salvar configuração manual</Button></div>
            </form>
          </details>
        ) : null}
      </div>
    </section>
  );
}
