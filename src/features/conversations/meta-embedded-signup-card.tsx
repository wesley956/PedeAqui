"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { initializeFacebookSdk, loadFacebookSdk, type FacebookSdk } from "@/features/conversations/facebook-sdk";
import { Button } from "@/components/ui/button";
import {
  completeWhatsAppEmbeddedSignupAction,
  disconnectWhatsAppAction,
  getWhatsAppEmbeddedSignupBrowserConfigAction,
  startWhatsAppEmbeddedSignupAction,
} from "@/features/conversations/meta-embedded-signup-actions";
import {
  embeddedSignupFeatureType,
  parseEmbeddedSignupResult,
  type MetaEmbeddedSignupResult,
  type WhatsAppConnectionMode,
} from "@/features/conversations/whatsapp-connection-model";

type Status = {
  connection_status: string;
  onboarding_status: string;
  whatsapp_enabled: boolean;
  connection_mode: WhatsAppConnectionMode;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  connected_at: string | null;
  last_health_check_at: string | null;
  last_connection_error_kind: string | null;
};
type BrowserConfig = {
  ready: boolean;
  appId: string | null;
  configId: string | null;
  coexistenceConfigId: string | null;
  graphVersion: string | null;
  sessionInfoVersion: string;
};
function waitForEmbeddedSignupResult(mode: WhatsAppConnectionMode, signal: AbortSignal) {
  return new Promise<MetaEmbeddedSignupResult>((resolve, reject) => {
    function done() {
      window.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", onAbort);
    }
    function onAbort() {
      done();
      reject(new Error("Conexão interrompida."));
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let payload: unknown = event.data;
      if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { return; } }
      if (!payload || typeof payload !== "object") return;
      const data = payload as { type?: string; event?: string };
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "CANCEL" || data.event === "ERROR") {
        done();
        reject(new Error(data.event === "CANCEL" ? "Conexão cancelada." : "Não foi possível concluir a conexão do WhatsApp."));
        return;
      }
      const result = parseEmbeddedSignupResult(payload, mode);
      if (!result) return;
      done();
      resolve(result);
    }
    signal.addEventListener("abort", onAbort, { once: true });
    window.addEventListener("message", onMessage);
  });
}

function loginWithEmbeddedSignup(fb: FacebookSdk, configId: string, mode: WhatsAppConnectionMode, sessionInfoVersion: string, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(new Error("A conexão demorou demais ou foi cancelada. Tente novamente."));
    signal.addEventListener("abort", onAbort, { once: true });
    fb.login((response) => {
      signal.removeEventListener("abort", onAbort);
      const code = response.authResponse?.code;
      if (!code) reject(new Error("A autorização da Meta foi encerrada antes da conexão do WhatsApp.")); else resolve(code);
    }, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: embeddedSignupFeatureType(mode),
        sessionInfoVersion,
      },
    });
  });
}

function waitForMetaResultAfterLogin(promise: Promise<{ result: MetaEmbeddedSignupResult | null; error: Error | null }>) {
  return Promise.race([
    promise,
    new Promise<{ result: null; error: Error }>((resolve) => {
      window.setTimeout(() => resolve({
        result: null,
        error: new Error("A Meta autorizou o login, mas não concluiu a etapa do WhatsApp. Tente novamente; se persistir, a configuração do Cadastro Incorporado precisa ser revisada."),
      }), 12_000);
    }),
  ]);
}

function humanStatus(status: Status) {
  if (status.connection_status === "connected") return "WhatsApp conectado";
  if (status.onboarding_status === "awaiting_meta") return "Aguardando sua confirmação";
  if (["authorizing", "configuring_assets", "subscribing_webhooks", "registering_phone", "health_checking"].includes(status.onboarding_status)) return "Finalizando conexão…";
  if (status.connection_status === "action_required") return "Reconecte seu WhatsApp";
  if (status.connection_status === "temporarily_unavailable") return "Conexão temporariamente indisponível";
  return "Conecte o WhatsApp da loja";
}

function connectionModeLabel(mode: WhatsAppConnectionMode) {
  return mode === "coexistence" ? "No celular + PedeAqui" : "Exclusivo no PedeAqui";
}

export function MetaEmbeddedSignupCard({ status, platformReady }: { status: Status; platformReady: boolean }) {
  const [pending, startTransition] = useTransition();
  const [connecting, setConnecting] = useState(false);
  const connection = useRef<AbortController | null>(null);
  useEffect(() => () => { connection.current?.abort(); }, []);
  const [message, setMessage] = useState<string | null>(null);
  const [browserConfig, setBrowserConfig] = useState<BrowserConfig | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkFailed, setSdkFailed] = useState(false);
  const connected = status.connection_status === "connected" && status.whatsapp_enabled;

  useEffect(() => {
    if (!platformReady) return;
    let active = true;
    getWhatsAppEmbeddedSignupBrowserConfigAction()
      .then(async (config) => {
        if (!config.ready || !config.appId || !config.configId || !config.graphVersion) throw new Error("Configuração da Meta incompleta.");
        if (!active) return;
        setBrowserConfig(config);
        await loadFacebookSdk(config.appId, config.graphVersion);
        if (active) setSdkReady(true);
      })
      .catch(() => {
        if (!active) return;
        setSdkFailed(true);
        setMessage("Não foi possível preparar a conexão segura do WhatsApp. Atualize a página e tente novamente.");
      });
    return () => { active = false; };
  }, [platformReady]);

  function connect(mode: WhatsAppConnectionMode) {
    if (connection.current) return;
    setMessage(null);
    let fb: FacebookSdk;
    const configId = mode === "coexistence"
      ? browserConfig?.coexistenceConfigId || browserConfig?.configId
      : browserConfig?.configId;
    if (!sdkReady || !browserConfig?.appId || !browserConfig.graphVersion || !configId) {
      setMessage("A conexão segura ainda está sendo preparada. Aguarde alguns segundos e tente novamente.");
      return;
    }

    try { fb = initializeFacebookSdk(browserConfig.appId, browserConfig.graphVersion); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Atualize a página e tente novamente."); return; }
    const controller = new AbortController();
    connection.current = controller;
    setConnecting(true);
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new Error("A conexão demorou demais ou foi interrompida. Atualize a página e confira o estado do WhatsApp antes de tentar novamente.")), { once: true });
    });
    void aborted.catch(() => {});
    const metaOutcomePromise = waitForEmbeddedSignupResult(mode, controller.signal).then(
      (result) => ({ result, error: null as Error | null }),
      (error: unknown) => ({ result: null, error: error instanceof Error ? error : new Error("Não foi possível concluir a conexão do WhatsApp.") }),
    );

    // FB.login must be invoked directly from the user's click. Do not await a
    // Server Action before this call or browsers/Meta can lose the popup gesture.
    const codePromise = loginWithEmbeddedSignup(fb, configId, mode, browserConfig.sessionInfoVersion, controller.signal);
    const sessionPromise = startWhatsAppEmbeddedSignupAction(mode);

    startTransition(async () => {
      try {
        const [session, code] = await Promise.race([
          Promise.all([sessionPromise, codePromise]),
          aborted,
          metaOutcomePromise.then((outcome) => {
            if (outcome.error) throw outcome.error;
            return new Promise<never>(() => {});
          }),
        ]);
        const metaOutcome = await Promise.race([waitForMetaResultAfterLogin(metaOutcomePromise), aborted]);
        if (metaOutcome.error || !metaOutcome.result) throw metaOutcome.error ?? new Error("A Meta não devolveu os dados da conexão do WhatsApp.");
        const metaResult = metaOutcome.result;
        const result = await Promise.race([completeWhatsAppEmbeddedSignupAction({
          sessionId: session.sessionId,
          stateToken: session.stateToken,
          code,
          wabaId: metaResult.wabaId,
          phoneNumberId: metaResult.phoneNumberId,
          businessId: metaResult.businessId,
          mode,
        }), aborted]);
        controller.abort();
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        setMessage(result.displayPhoneNumber ? `WhatsApp ${result.displayPhoneNumber} conectado com sucesso.` : "WhatsApp conectado com sucesso.");
        window.location.reload();
      } catch (error) {
        controller.abort();
        setMessage(error instanceof Error ? error.message : "Não foi possível concluir a conexão do WhatsApp.");
      } finally {
        window.clearTimeout(timeout);
        controller.abort();
        connection.current = null;
        setConnecting(false);
      }
    });
  }

  function disconnect() {
    if (!window.confirm("Desconectar este WhatsApp do PedeAqui? O histórico de conversas e pedidos será preservado.")) return;
    setMessage(null);
    startTransition(async () => {
      try { await disconnectWhatsAppAction(); window.location.reload(); }
      catch { setMessage("Não foi possível desconectar o WhatsApp agora."); }
    });
  }

  const connectionDisabled = connecting || pending || !platformReady || !sdkReady || sdkFailed;

  return (
    <div style={{ display: "grid", gap: 14, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>WhatsApp da loja</p>
          <strong style={{ fontSize: "var(--font-size-lg)" }}>{humanStatus(status)}</strong>
        </div>
        {connected ? <span style={{ fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)", color: "var(--accent)" }}>Funcionando</span> : null}
      </div>

      {connected ? <>
        <div style={{ display: "grid", gap: 4, fontSize: "var(--font-size-support)" }}>
          {status.verified_name ? <span>Perfil: <strong>{status.verified_name}</strong></span> : null}
          {status.display_phone_number ? <span>Número: <strong>{status.display_phone_number}</strong></span> : null}
          <span>Como está conectado: <strong>{connectionModeLabel(status.connection_mode)}</strong></span>
          {status.quality_rating ? <span>Qualidade da conexão: <strong>{status.quality_rating}</strong></span> : null}
        </div>

        <div style={{ display: "grid", gap: 7, padding: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <strong style={{ fontSize: "var(--font-size-sm)" }}>Faça um teste rápido</strong>
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>1. De outro número, envie uma mensagem para o WhatsApp da loja.</span>
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>2. Confira se a conversa aparece no PedeAqui e responda por lá.</span>
          {status.connection_mode === "coexistence" ? <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>3. Responda também pelo WhatsApp Business do celular e confirme que a conversa continua sincronizada.</span> : null}
          <span className="muted" style={{ fontSize: "var(--font-size-support)" }}>Esse teste verifica somente o atendimento e não cria nem altera pedidos.</span>
        </div>
      </> : <div style={{ display: "grid", gap: 12 }}>
        <div>
          <strong style={{ fontSize: "var(--font-size-md)" }}>Como você usa o WhatsApp hoje?</strong>
          <p className="muted" style={{ margin: "5px 0 0", fontSize: "var(--font-size-support)" }}>Escolha a opção que combina com a sua loja. O PedeAqui cuida da parte técnica.</p>
        </div>

        <button
          type="button"
          onClick={() => connect("coexistence")}
          disabled={connectionDisabled}
          style={{ textAlign: "left", padding: 14, borderRadius: "var(--radius-lg)", border: "2px solid var(--accent)", background: "var(--surface)", color: "var(--text)", cursor: connectionDisabled ? "not-allowed" : "pointer" }}
        >
          <span style={{ display: "inline-block", marginBottom: 7, padding: "3px 7px", borderRadius: "var(--radius-pill)", fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)", background: "var(--surface-2)" }}>RECOMENDADO</span>
          <strong style={{ display: "block" }}>Já uso WhatsApp Business no celular</strong>
          <span className="muted" style={{ display: "block", marginTop: 5, fontSize: "var(--font-size-support)" }}>Continue atendendo normalmente pelo aplicativo e use o PedeAqui ao mesmo tempo. Durante a conexão, o WhatsApp pode pedir uma confirmação ou mostrar um QR Code para você escanear no celular.</span>
        </button>

        <button
          type="button"
          onClick={() => connect("cloud_api")}
          disabled={connectionDisabled}
          style={{ textAlign: "left", padding: 12, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: connectionDisabled ? "not-allowed" : "pointer" }}
        >
          <strong>Quero usar um número exclusivo no PedeAqui</strong>
          <span className="muted" style={{ display: "block", marginTop: 4, fontSize: "var(--font-size-support)" }}>Escolha esta opção quando o número será dedicado ao atendimento pelo sistema.</span>
        </button>

        <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Você não precisa enviar senha, código de segurança ou token ao PedeAqui. Quando necessário, a autorização é feita diretamente na janela oficial do WhatsApp/Meta.</p>
      </div>}

      {!platformReady ? <p style={{ margin: 0, fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)" }}>A conexão do WhatsApp está temporariamente indisponível nesta conta. Tente novamente mais tarde ou fale com o suporte.</p> : null}
      {platformReady && !sdkReady && !sdkFailed ? <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>Preparando a conexão segura com o WhatsApp…</p> : null}
      {status.last_connection_error_kind ? <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-support)" }}>A última tentativa não foi concluída. Você pode iniciar a conexão novamente sem perder o histórico.</p> : null}
      {message ? <p role="status" style={{ margin: 0, fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)" }}>{message}</p> : null}
      {connected ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => connect(status.connection_mode)} disabled={connectionDisabled}>{connecting || pending ? "Conectando…" : "Reconectar WhatsApp"}</Button>
        <Button type="button" tone="secondary" onClick={disconnect} disabled={pending}>Desconectar</Button>
      </div> : connecting || pending ? <p role="status" style={{ margin: 0, fontSize: "var(--font-size-support)", fontWeight: "var(--font-weight-bold)" }}>Conectando seu WhatsApp… siga as etapas na janela que foi aberta.</p> : null}
    </div>
  );
}

