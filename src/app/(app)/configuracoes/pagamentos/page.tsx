import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import { saveOnlinePixProviderAction, savePaymentMethodsAction } from "@/features/payments/actions";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";

const paymentHints: Record<string, string> = {
  cash: "O cliente pode informar se precisa de troco.",
  pix: "No cardápio público, o Pix só aparece quando o Pix online abaixo estiver configurado e ativo.",
  credit_card: "O cliente pode escolher cartão de crédito para pagar conforme a operação da unidade.",
  debit_card: "O cliente pode escolher cartão de débito para pagar conforme a operação da unidade.",
};

export default async function PaymentSettingsPage() {
  const [methods, providerResult, requestHeaders] = await Promise.all([
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
  const statusText = !config?.credentialsConfigured
    ? "Ainda não conectado"
    : config.enabled
      ? "Configurado e ativo"
      : "Configurado, mas desativado";

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 820 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Formas de pagamento</h1>
        <p className="muted" style={{ margin: 0 }}>Defina as opções do cliente e conecte o Pix online da unidade.</p>
      </header>

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

      <form action={saveOnlinePixProviderAction} className="card" style={{ padding: 20, display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Pix online</p>
            <h2 style={{ margin: "4px 0", fontSize: 20 }}>Mercado Pago</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Gera QR Code com o valor exato e confirma o pagamento automaticamente pelo webhook.</p>
          </div>
          <strong style={{ fontSize: 13 }}>{statusText}</strong>
        </div>

        <label style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
          <div><strong>Receber Pix automaticamente</strong><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Só ative depois de informar as duas credenciais abaixo.</div></div>
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
          <span className="muted" style={{ fontSize: 12 }}>A credencial é enviada somente ao servidor e armazenada no cofre seguro do projeto.</span>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Chave secreta do webhook</span>
          <input type="password" name="webhookSecret" autoComplete="off" placeholder={config?.credentialsConfigured ? "Deixe em branco para manter a atual" : "Cole a assinatura secreta do webhook"} />
        </label>

        <div style={{ padding: 14, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <strong>URL do webhook</strong>
          <p className="muted" style={{ margin: "5px 0 8px", fontSize: 12 }}>No Mercado Pago, configure o evento <b>Order (Mercado Pago)</b> usando esta URL:</p>
          <code style={{ overflowWrap: "anywhere", fontSize: 12 }}>{webhookUrl}</code>
        </div>

        {config?.healthStatus === "error" ? <p style={{ margin: 0 }}>A última verificação encontrou um problema. Revise as credenciais antes de usar o Pix online.</p> : null}
        {config?.healthStatus === "unknown" && config.credentialsConfigured ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Credenciais armazenadas. A homologação final acontece com um Pix real de baixo valor.</p> : null}
        <div><Button type="submit">Salvar Pix online</Button></div>
      </form>
    </section>
  );
}
