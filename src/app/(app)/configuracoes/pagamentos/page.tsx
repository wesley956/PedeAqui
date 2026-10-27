import { Input, SelectField } from "@/components/ui/form-controls";
import { FormDisclosure } from "@/components/ui/form-disclosure";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import styles from "../settings-form.module.css";
import { headers } from "next/headers";
import { Button } from "@/components/ui/button";
import buttonStyles from "@/components/ui/button.module.css";
import {
  addCustomPaymentMethodAction,
  archiveCustomPaymentMethodAction,
  disconnectMercadoPagoOAuthAction,
  disconnectPagBankAction,
  disconnectInfinitePayAction,
  toggleInfinitePayAction,
  renameCustomPaymentMethodAction,
  saveOnlinePixProviderAction,
  savePaymentMethodsAction,
  toggleCustomPaymentMethodAction,
  toggleOnlinePixProviderAction,
  togglePagBankAction,
} from "@/features/payments/actions";
import { InfinitePayConnectionForm } from "@/features/payments/infinitepay-connection-form";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { isMercadoPagoOAuthConfigured } from "@/server/payments/providers/mercado-pago-oauth";
import { isPagBankConnectConfigured } from "@/server/payments/providers/pagbank-connect";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";

const paymentHints: Record<string, string> = {
  cash: "O cliente pode informar se precisa de troco.",
  pix: "No cardápio público, o Pix só aparece quando o Pix online (aba ao lado) estiver conectado e ativo.",
  credit_card: "O cliente pode escolher cartão de crédito para pagar conforme a operação da unidade.",
  debit_card: "O cliente pode escolher cartão de débito para pagar conforme a operação da unidade.",
};

const mercadoPagoStatusMessages: Record<string, string> = {
  connected: "Mercado Pago conectado com sucesso. O Pix continua desligado até você ativá-lo nesta unidade.",
  authorization_denied: "A autorização foi cancelada no Mercado Pago. Você pode tentar conectar novamente.",
  oauth_error: "Não foi possível concluir a conexão com o Mercado Pago. Tente novamente.",
  session_invalid: "A sessão de conexão expirou ou não foi reconhecida. Clique em Conectar Mercado Pago novamente e conclua nesta mesma janela.",
  context_changed: "A unidade selecionada mudou durante a conexão. Selecione a unidade correta e conecte novamente.",
  token_exchange_failed: "O Mercado Pago não concluiu a autorização. Inicie uma nova conexão; se o erro continuar, solicite a revisão da integração ao suporte do PedeAqui.",
  connection_save_failed: "A autorização retornou, mas o PedeAqui não conseguiu salvar a conexão. Solicite a revisão ao suporte antes de tentar novamente.",
  not_authorized: "Sua sessão não tem permissão para gerenciar os pagamentos desta unidade.",
  store_required: "Selecione uma unidade antes de conectar o Mercado Pago.",
  setup_required: "O servidor ainda não reconheceu todas as configurações necessárias do Mercado Pago.",
};

const pagBankStatusMessages: Record<string, string> = {
  connected: "PagBank conectado. O Pix continua desligado até você ativá-lo nesta unidade.",
  authorization_denied: "A autorização foi cancelada no PagBank. Você pode tentar conectar novamente.",
  oauth_error: "Não foi possível concluir a conexão com o PagBank. Tente novamente.",
  not_authorized: "Sua sessão não tem permissão para gerenciar os pagamentos desta unidade.",
  store_required: "Selecione uma unidade antes de conectar o PagBank.",
  setup_required: "O servidor ainda não tem as configurações do PagBank Connect.",
};

type PaymentSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaymentSettingsPage({ searchParams }: PaymentSettingsPageProps) {
  const [params, methods, customMethods, providerResult, requestHeaders] = await Promise.all([
    searchParams,
    StorePaymentMethodService.listCurrentStore(),
    StorePaymentMethodService.listCustomCurrentStore(),
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
  const statusText = !config?.credentialsConfigured ? "Ainda não conectado" : config.enabled ? "Conectado e Pix ativo" : "Conectado, Pix desativado";
  const accountLabel = config?.providerAccountId ? `Conta Mercado Pago ••••${config.providerAccountId.slice(-4)}` : "Conta Mercado Pago conectada";
  const infinitepay = providerResult.infinitepay;
  const infinitePayConnected = Boolean(infinitepay?.credentialsConfigured && !infinitepay.revokedAt);
  const pagbank = providerResult.pagbank;
  const pagBankConnected = Boolean(pagbank?.credentialsConfigured && !pagbank.revokedAt);
  const pagBankAvailable = isPagBankConnectConfigured();
  const pagBankStatusParam = params.pagbank;
  const pagBankStatus = Array.isArray(pagBankStatusParam) ? pagBankStatusParam[0] : pagBankStatusParam;
  const pagBankMessage = pagBankStatus ? pagBankStatusMessages[pagBankStatus] : null;
  const pagBankStatusText = !pagBankConnected ? "Ainda não conectado" : pagbank?.enabled ? "Conectado e Pix ativo" : "Conectado, Pix desativado";
  // Duas abas: o que o cliente pode usar (dia a dia) e a conexão do Pix online (feita uma vez).
  const tabParam = Array.isArray(params.aba) ? params.aba[0] : params.aba;
  const tab = tabParam === "online" || mercadoPagoStatus || pagBankStatus ? "online" : "formas";
  const onlineActive = Boolean((config?.credentialsConfigured && config?.enabled) || (pagBankConnected && pagbank?.enabled) || (infinitePayConnected && infinitepay?.enabled));

  return (
    <section className={styles.page}>
      <PageHeader title="Formas de pagamento" description="Defina as opções do cliente e conecte o pagamento online da unidade." />

      <PageTabs label="Seções de pagamento" active={tab} tabs={[
        { key: "formas", label: "Formas aceitas", href: "/configuracoes/pagamentos" },
        { key: "online", label: onlineActive ? "Pagamento online · ativo" : "Pagamento online", href: "/configuracoes/pagamentos?aba=online" },
      ]} />

      {mercadoPagoMessage ? <div role={mercadoPagoStatus === "connected" ? "status" : "alert"} className="card" style={{ padding: 14 }}>{mercadoPagoMessage}</div> : null}
      {pagBankMessage ? <div role={pagBankStatus === "connected" ? "status" : "alert"} className="card" style={{ padding: 14 }}>{pagBankMessage}</div> : null}

      {tab === "formas" ? <>
      <form action={savePaymentMethodsAction} aria-label="Formas aceitas" className={styles.form}>
        <div>
          <strong>Opções aceitas pela unidade</strong>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--font-size-support)" }}>Cartões e dinheiro seguem a operação local. O Pix público depende da conexão online configurada abaixo.</p>
        </div>
        {methods.map((item) => (
          <label key={item.method} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface-2)" }}>
            <div><strong>{paymentMethodLabels[item.method]}</strong><div className="muted" style={{ fontSize: "var(--font-size-support)", marginTop: 4 }}>{paymentHints[item.method]}</div></div>
            <input type="checkbox" name="method" value={item.method} defaultChecked={item.enabled} aria-label={`Ativar ${paymentMethodLabels[item.method]}`} />
          </label>
        ))}
        <div style={{ marginTop: 8 }}><Button type="submit">Salvar formas de pagamento</Button></div>
      </form>

      <div className={styles.card}>
        <div>
          <strong>Outras formas aceitas</strong>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "var(--font-size-support)" }}>Adicione benefícios, vouchers ou cartões específicos, como Ticket Refeição, Alelo, VR ou Pluxee. Eles aparecem diretamente no checkout.</p>
        </div>

        <FormDisclosure summary="Adicionar forma de pagamento" className={styles.details}>
          <form action={addCustomPaymentMethodAction} aria-label="Adicionar forma personalizada" className={styles.form}>
            <Input id="payment-custom-name" name="name" label="Nome da forma de pagamento" required minLength={2} maxLength={60} placeholder="Ex.: Ticket Refeição" />
            <div className={styles.actions}><Button type="submit">Adicionar forma de pagamento</Button></div>
          </form>
        </FormDisclosure>

        {customMethods.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Nenhuma forma personalizada cadastrada.</p> : customMethods.map((item) => (
          <div key={item.id} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface-2)", display: "grid", gap: 10 }}>
            <form action={renameCustomPaymentMethodAction} aria-label={`Renomear ${item.name}`} className={styles.grid}>
              <input type="hidden" name="id" value={item.id} />
              <Input id={`payment-name-${item.id}`} name="name" label="Nome da forma de pagamento" required minLength={2} maxLength={60} defaultValue={item.name} />
              <Button type="submit" tone="secondary">Salvar nome</Button>
            </form>
            <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <form action={toggleCustomPaymentMethodAction} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="hidden" name="id" value={item.id} />
                <label className={styles.checkLabel}><input type="checkbox" name="enabled" defaultChecked={item.enabled} />Ativar {item.name}</label>
                <Button type="submit" tone="secondary">{item.enabled ? "Salvar ativação" : "Ativar"}</Button>
              </form>
              <form action={archiveCustomPaymentMethodAction}>
                <input type="hidden" name="id" value={item.id} />
                <ConfirmSubmitButton tone="secondary" size="md" confirmation={`Remover ${item.name} das formas aceitas?`}>Remover</ConfirmSubmitButton>
              </form>
            </div>
          </div>
        ))}
      </div>

      </> : null}

      {tab === "online" ? <>
      <p className="muted" style={{ margin: 0 }}>Conecte uma conta para receber pelo cardápio com confirmação automática. Escolha um provedor ativo por unidade. A InfinitePay oferece Pix e cartão no checkout online.</p>
      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div><p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Pix online</p><h2 style={{ margin: "4px 0", fontSize: "var(--font-size-lg)" }}>Mercado Pago</h2><p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>A conta do restaurante recebe o pagamento. O PedeAqui gera o QR e confirma pelo webhook.</p></div>
          <strong style={{ fontSize: "var(--font-size-support)" }}>{statusText}</strong>
        </div>

        {oauthConnected ? (
          <>
            <div style={{ padding: 14, borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", gap: 5 }}>
              <strong>{accountLabel}</strong><span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Conexão OAuth autorizada. Credenciais ficam somente no servidor.</span>
              {config?.authorizedAt ? <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Autorizada em {new Date(config.authorizedAt).toLocaleString("pt-BR")}</span> : null}
            </div>
            <form action={toggleOnlinePixProviderAction} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <div><strong>Receber Pix automaticamente</strong><div className="muted" style={{ fontSize: "var(--font-size-support)", marginTop: 3 }}>Conectar a conta não ativa o Pix. A ativação é separada e vale só para esta unidade.</div></div>
                <input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} />
              </label>
              <div><Button type="submit">Salvar ativação do Pix</Button></div>
            </form>
            <form action={disconnectMercadoPagoOAuthAction}><ConfirmSubmitButton tone="secondary" size="md" confirmation="Desconectar o Mercado Pago desta unidade?">Desconectar Mercado Pago</ConfirmSubmitButton></form>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div><strong>Conexão recomendada</strong><p className="muted" style={{ margin: "5px 0 0", fontSize: "var(--font-size-support)" }}>O restaurante autoriza o PedeAqui no Mercado Pago sem copiar Access Token. A conexão começa com Pix desligado.</p></div>
            {oauthAvailable ? <a href="/api/integrations/mercado-pago/oauth/start" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`} style={{ width: "fit-content" }}>Conectar Mercado Pago</a> : <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>A aplicação Mercado Pago do PedeAqui ainda precisa das credenciais globais e da Redirect URI no servidor para liberar este botão.</p>}
          </div>
        )}

        <div style={{ padding: 14, borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border)" }}><strong>URL do webhook desta unidade</strong><p className="muted" style={{ margin: "5px 0 8px", fontSize: "var(--font-size-support)" }}>Endpoint que recebe eventos Order do Mercado Pago e reconcilia o pagamento antes de marcar como pago.</p><code style={{ overflowWrap: "anywhere", fontSize: "var(--font-size-support)" }}>{webhookUrl}</code></div>
        {config?.healthStatus === "error" && config.errorCode !== "oauth_disconnected" ? <p style={{ margin: 0 }}>A última verificação encontrou um problema. O Pix online fica isolado; dinheiro e cartões não dependem desta integração.</p> : null}
        {config?.healthStatus === "unknown" && config.credentialsConfigured ? <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Conexão armazenada. A homologação final exige um Pix real de baixo valor antes do rollout.</p> : null}

        {!oauthConnected ? (
          <FormDisclosure summary="Configuração manual avançada" className={styles.details}>
            <form action={saveOnlinePixProviderAction} aria-label="Configuração manual do Pix" className={styles.form}>
              <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Compatibilidade temporária para configuração manual. Prefira OAuth para restaurantes clientes.</p>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}><div><strong>Receber Pix automaticamente</strong><div className="muted" style={{ fontSize: "var(--font-size-support)", marginTop: 3 }}>Só ative depois de informar as credenciais.</div></div><input type="checkbox" name="enabled" defaultChecked={config?.enabled ?? false} /></label>
              <SelectField id="pix-environment" name="environment" label="Ambiente" defaultValue={config?.environment ?? "production"}><option value="production">Produção</option><option value="test">Teste</option></SelectField>
              <Input id="pix-access-token" type="password" name="accessToken" label="Access Token" autoComplete="off" placeholder={config?.credentialsConfigured ? "Deixe em branco para manter o atual" : "Cole o Access Token do Mercado Pago"} hint="A credencial é enviada somente ao servidor e armazenada no Vault." />
              <Input id="pix-webhook-secret" type="password" name="webhookSecret" label="Chave secreta do webhook" autoComplete="off" placeholder={config?.credentialsConfigured ? "Deixe em branco para manter a atual" : "Cole a assinatura secreta do webhook"} />
              <div><Button type="submit">Salvar configuração manual</Button></div>
            </form>
          </FormDisclosure>
        ) : null}
      </div>

      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div><p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Pix online</p><h2 style={{ margin: "4px 0", fontSize: "var(--font-size-lg)" }}>PagBank</h2><p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Receba Pix pelo PagBank. Ativar um provedor desativa os demais nesta unidade.</p></div>
          <strong style={{ fontSize: "var(--font-size-support)" }}>{pagBankStatusText}</strong>
        </div>

        {pagBankConnected ? (
          <>
            <div style={{ padding: 14, borderRadius: "var(--radius-lg)", background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", gap: 5 }}>
              <strong>Conta PagBank conectada</strong>
              <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>{pagbank?.environment === "production" ? "Ambiente de produção." : "Ambiente de testes (sandbox): nenhum dinheiro real é movimentado."} Credenciais ficam somente no servidor.</span>
              {pagbank?.authorizedAt ? <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Autorizada em {new Date(pagbank.authorizedAt).toLocaleString("pt-BR")}</span> : null}
            </div>
            <form action={togglePagBankAction} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <div><strong>Receber Pix pelo PagBank</strong><div className="muted" style={{ fontSize: "var(--font-size-support)", marginTop: 3 }}>O cliente informa o CPF na página do pedido, porque o PagBank exige. O CPF não fica salvo no PedeAqui.</div></div>
                <input type="checkbox" name="enabled" defaultChecked={pagbank?.enabled ?? false} />
              </label>
              <div><Button type="submit">Salvar ativação do PagBank</Button></div>
            </form>
            {pagbank?.healthStatus === "error" ? <p style={{ margin: 0 }}>A última tentativa com o PagBank falhou. O Pix online fica isolado; dinheiro e cartões não dependem desta integração.</p> : null}
            <form action={disconnectPagBankAction}><ConfirmSubmitButton tone="secondary" size="md" confirmation="Desconectar o PagBank desta unidade?">Desconectar PagBank</ConfirmSubmitButton></form>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>O restaurante autoriza o PedeAqui na conta PagBank dele. O dinheiro cai direto nessa conta e o PedeAqui confirma o pagamento sozinho.</p>
            {pagBankAvailable ? <a href="/api/integrations/pagbank/oauth/start" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`} style={{ width: "fit-content" }}>Conectar PagBank</a> : <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>A aplicação PagBank do PedeAqui ainda precisa ser cadastrada e configurada no servidor para liberar este botão.</p>}
          </div>
        )}
      </div>
      <div className={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><h2 style={{ margin: "4px 0", fontSize: "var(--font-size-lg)" }}>InfinitePay</h2><p className="muted" style={{ margin: 0 }}>Receba Pix ou cartão de crédito na conta InfinitePay da loja. O cliente paga em uma página segura e o pedido é atualizado automaticamente.</p></div>
          <strong>{!infinitePayConnected ? "Ainda não conectada" : infinitepay?.enabled ? "Conectada e ativa" : "Conectada, desativada"}</strong>
        </div>
        <p className="muted" style={{ margin: 0 }}>No aplicativo InfinitePay, abra Vendas → Checkout → Configurações. Habilite o Checkout Integrado e crie uma chave de integração para o PedeAqui.</p>
        <InfinitePayConnectionForm handle={infinitepay?.providerAccountId ?? null} configured={Boolean(infinitepay?.credentialsConfigured)} />
        {infinitePayConnected ? <>
          <form action={toggleInfinitePayAction} style={{ display: "grid", gap: 12 }}>
            <label className={styles.checkLabel}><input type="checkbox" name="enabled" defaultChecked={infinitepay?.enabled ?? false} />Receber online pela InfinitePay</label>
            <p className="muted" style={{ margin: 0 }}>Ao ativar, o cliente poderá escolher Pix ou cartão online. As opções de cartão na entrega e dinheiro continuam disponíveis conforme suas formas aceitas.</p>
            <div><Button type="submit">Salvar ativação da InfinitePay</Button></div>
          </form>
          {infinitepay?.healthStatus === "error" ? <p role="alert">A última tentativa falhou. Confira sua conexão InfinitePay antes de receber novos pagamentos.</p> : null}
          <form action={disconnectInfinitePayAction}><ConfirmSubmitButton tone="secondary" size="md" confirmation="Desconectar a InfinitePay desta unidade?">Desconectar InfinitePay</ConfirmSubmitButton></form>
        </> : null}
      </div>
      </> : null}
    </section>
  );
}
