"use client";

import { useEffect, useState, useTransition } from "react";
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
type FacebookLoginResponse = { authResponse?: { code?: string } };
type FacebookSdk = {
  init(input: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
};

declare global { interface Window { FB?: FacebookSdk; } }
let sdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk(appId: string, version: string) {
  if (window.FB) {
    window.FB.init({ appId, cookie: true, xfbml: false, version });
    return Promise.resolve(window.FB);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    const fail = () => {
      sdkPromise = null;
      reject(new Error("Não foi possível carregar a conexão segura do WhatsApp."));
    };
    const finish = () => {
      if (!window.FB) return fail();
      window.FB.init({ appId, cookie: true, xfbml: false, version });
      resolve(window.FB);
    };
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.body.appendChild(script);
  });
  return sdkPromise;
}

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

function loginWithEmbeddedSignup(fb: FacebookSdk, configId: string, mode: WhatsAppConnectionMode, sessionInfoVersion: string) {
  return new Promise<string>((resolve, reject) => {
    fb.login((response) => {
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
    setMessage(null);
    const fb = window.FB;
    const configId = mode === "coexistence"
      ? browserConfig?.coexistenceConfigId || browserConfig?.configId
      : browserConfig?.configId;
    if (!sdkReady || !fb || !browserConfig?.appId || !browserConfig.graphVersion || !configId) {
      setMessage("A conexão segura ainda está sendo preparada. Aguarde alguns segundos e tente novamente.");
      return;
    }

    const controller = new AbortController();
    const metaOutcomePromise = waitForEmbeddedSignupResult(mode, controller.signal).then(
      (result) => ({ result, error: null as Error | null }),
      (error: unknown) => ({ result: null, error: error instanceof Error ? error : new Error("Não foi possível concluir a conexão do WhatsApp.") }),
    );

    // FB.login must be invoked directly from the user's click. Do not await a
    // Server Action before this call or browsers/Meta can lose the popup gesture.
    const codePromise = loginWithEmbeddedSignup(fb, configId, mode, browserConfig.sessionInfoVersion);
    const sessionPromise = startWhatsAppEmbeddedSignupAction(mode);

    startTransition(async () => {
      try {
        const [session, code] = await Promise.all([sessionPromise, codePromise]);
        const metaOutcome = await waitForMetaResultAfterLogin(metaOutcomePromise);
        if (metaOutcome.error || !metaOutcome.result) throw metaOutcome.error ?? new Error("A Meta não devolveu os dados da conexão do WhatsApp.");
        const metaResult = metaOutcome.result;
        const result = await completeWhatsAppEmbeddedSignupAction({
          sessionId: session.sessionId,
          stateToken: session.stateToken,
          code,
          wabaId: metaResult.wabaId,
          phoneNumberId: metaResult.phoneNumberId,
          businessId: metaResult.businessId,
          mode,
        });
        controller.abort();
        setMessage(result.displayPhoneNumber ? `WhatsApp ${result.displayPhoneNumber} conectado com sucesso.` : "WhatsApp conectado com sucesso.");
        window.location.reload();
      } catch (error) {
        controller.abort();
        setMessage(error instanceof Error ? error.message : "Não foi possível concluir a conexão do WhatsApp.");
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

  const connectionDisabled = pending || !platformReady || !sdkReady || sdkFailed;

  return (
    <div style={{ display: "grid", gap: 14, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>WhatsApp da loja</p>
          <strong style={{ fontSize: 18 }}>{humanStatus(status)}</strong>
        </div>
        {connected ? <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>Funcionando</span> : null}
      </div>

      {connected ? <>
        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {status.verified_name ? <span>Perfil: <strong>{status.verified_name}</strong></span> : null}
          {status.display_phone_number ? <span>Número: <strong>{status.display_phone_number}</strong></span> : null}
          <span>Como está conectado: <strong>{connectionModeLabel(status.connection_mode)}</strong></span>
          {status.quality_rating ? <span>Qualidade da conexão: <strong>{status.quality_rating}</strong></span> : null}
        </div>

        <div style={{ display: "grid", gap: 7, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
          <strong style={{ fontSize: 14 }}>Faça um teste rápido</strong>
          <span className="muted" style={{ fontSize: 12 }}>1. De outro número, envie uma mensagem para o WhatsApp da loja.</span>
          <span className="muted" style={{ fontSize: 12 }}>2. Confira se a conversa aparece no PedeAqui e responda por lá.</span>
          {status.connection_mode === "coexistence" ? <span className="muted" style={{ fontSize: 12 }}>3. Responda também pelo WhatsApp Business do celular e confirme que a conversa continua sincronizada.</span> : null}
          <span className="muted" style={{ fontSize: 12 }}>Esse teste verifica somente o atendimento e não cria nem altera pedidos.</span>
        </div>
      </> : <div style={{ display: "grid", gap: 12 }}>
        <div>
          <strong style={{ fontSize: 15 }}>Como você usa o WhatsApp hoje?</strong>
          <p className="muted" style={{ margin: "5px 0 0", fontSize: 13 }}>Escolha a opção que combina com a sua loja. O PedeAqui cuida da parte técnica.</p>
        </div>

        <button
          type="button"
          onClick={() => connect("coexistence")}
          disabled={connectionDisabled}
          style={{ textAlign: "left", padding: 14, borderRadius: 12, border: "2px solid var(--accent)", background: "var(--surface)", color: "var(--text)", cursor: connectionDisabled ? "not-allowed" : "pointer" }}
        >
          <span style={{ display: "inline-block", marginBottom: 7, padding: "3px 7px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: "var(--surface-2)" }}>RECOMENDADO</span>
          <strong style={{ display: "block" }}>Já uso WhatsApp Business no celular</strong>
          <span className="muted" style={{ display: "block", marginTop: 5, fontSize: 12 }}>Continue atendendo normalmente pelo aplicativo e use o PedeAqui ao mesmo tempo. Durante a conexão, o WhatsApp pode pedir uma confirmação ou mostrar um QR Code para você escanear no celular.</span>
        </button>

        <button
          type="button"
          onClick={() => connect("cloud_api")}
          disabled={connectionDisabled}
          style={{ textAlign: "left", padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: connectionDisabled ? "not-allowed" : "pointer" }}
        >
          <strong>Quero usar um número exclusivo no PedeAqui</strong>
          <span className="muted" style={{ display: "block", marginTop: 4, fontSize: 12 }}>Escolha esta opção quando o número será dedicado ao atendimento pelo sistema.</span>
        </button>

        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Você não precisa enviar senha, código de segurança ou token ao PedeAqui. Quando necessário, a autorização é feita diretamente na janela oficial do WhatsApp/Meta.</p>
      </div>}

      {!platformReady ? <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>A conexão do WhatsApp está temporariamente indisponível nesta conta. Tente novamente mais tarde ou fale com o suporte.</p> : null}
      {platformReady && !sdkReady && !sdkFailed ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Preparando a conexão segura com o WhatsApp…</p> : null}
      {status.last_connection_error_kind ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>A última tentativa não foi concluída. Você pode iniciar a conexão novamente sem perder o histórico.</p> : null}
      {message ? <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{message}</p> : null}
      {connected ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button type="button" onClick={() => connect(status.connection_mode)} disabled={connectionDisabled}>{pending ? "Conectando…" : "Reconectar WhatsApp"}</Button>
        <Button type="button" tone="secondary" onClick={disconnect} disabled={pending}>Desconectar</Button>
      </div> : pending ? <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Conectando seu WhatsApp… siga as etapas na janela que foi aberta.</p> : null}
    </div>
  );
}
