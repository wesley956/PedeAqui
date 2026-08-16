"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  completeWhatsAppEmbeddedSignupAction,
  disconnectWhatsAppAction,
  startWhatsAppEmbeddedSignupAction,
} from "@/features/conversations/meta-embedded-signup-actions";

type Status = {
  connection_status: string;
  onboarding_status: string;
  whatsapp_enabled: boolean;
  display_phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  connected_at: string | null;
  last_health_check_at: string | null;
  last_connection_error_kind: string | null;
  meta_billing_mode: string;
};

type MetaSessionInfo = {
  wabaId: string;
  phoneNumberId: string;
  businessId: string | null;
};

type FacebookLoginResponse = { authResponse?: { code?: string } };
type FacebookSdk = {
  init(input: { appId: string; cookie: boolean; xfbml: boolean; version: string }): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
};

declare global {
  interface Window { FB?: FacebookSdk; }
}

let sdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk(appId: string, version: string) {
  if (window.FB) {
    window.FB.init({ appId, cookie: true, xfbml: false, version });
    return Promise.resolve(window.FB);
  }
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    const finish = () => {
      if (!window.FB) return reject(new Error("Não foi possível carregar a conexão segura da Meta."));
      window.FB.init({ appId, cookie: true, xfbml: false, version });
      resolve(window.FB);
    };
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Não foi possível carregar a conexão segura da Meta.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Não foi possível carregar a conexão segura da Meta.")), { once: true });
    document.body.appendChild(script);
  });
  return sdkPromise;
}

function waitForEmbeddedSignupResult() {
  return new Promise<MetaSessionInfo>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("A conexão com a Meta demorou demais. Tente novamente."));
    }, 10 * 60_000);

    function done() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (!payload || typeof payload !== "object") return;
      const data = payload as { type?: string; event?: string; data?: Record<string, unknown> };
      if (data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "CANCEL" || data.event === "ERROR") {
        done();
        reject(new Error(data.event === "CANCEL" ? "Conexão cancelada na Meta." : "A Meta não concluiu a conexão."));
        return;
      }
      if (data.event !== "FINISH") return;
      const wabaId = String(data.data?.waba_id ?? "");
      const phoneNumberId = String(data.data?.phone_number_id ?? "");
      const businessIdValue = data.data?.business_id ?? data.data?.business_manager_id ?? null;
      if (!/^\d{3,40}$/.test(wabaId) || !/^\d{3,40}$/.test(phoneNumberId)) {
        done();
        reject(new Error("A Meta concluiu sem informar os ativos necessários. Tente novamente."));
        return;
      }
      done();
      resolve({
        wabaId,
        phoneNumberId,
        businessId: businessIdValue && /^\d{3,40}$/.test(String(businessIdValue)) ? String(businessIdValue) : null,
      });
    }

    window.addEventListener("message", onMessage);
  });
}

function loginWithEmbeddedSignup(fb: FacebookSdk, configId: string) {
  return new Promise<string>((resolve, reject) => {
    fb.login((response) => {
      const code = response.authResponse?.code;
      if (!code) reject(new Error("A autorização da Meta não foi concluída."));
      else resolve(code);
    }, {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    });
  });
}

function humanStatus(status: Status) {
  if (status.connection_status === "connected") return "Conectado à Meta";
  if (status.onboarding_status === "awaiting_meta") return "Aguardando autorização da Meta";
  if (["authorizing", "configuring_assets", "subscribing_webhooks", "registering_phone", "health_checking"].includes(status.onboarding_status)) return "Finalizando configuração com a Meta…";
  if (status.connection_status === "action_required") return "Ação necessária";
  if (status.connection_status === "temporarily_unavailable") return "Temporariamente indisponível";
  return "WhatsApp não conectado";
}

export function MetaEmbeddedSignupCard({ status, platformReady }: { status: Status; platformReady: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const connected = status.connection_status === "connected" && status.whatsapp_enabled;

  function connect() {
    setMessage(null);
    startTransition(async () => {
      try {
        const session = await startWhatsAppEmbeddedSignupAction();
        if (!session.appId || !session.configId || !session.graphVersion) throw new Error("A integração da Meta ainda não está pronta.");
        const fb = await loadFacebookSdk(session.appId, session.graphVersion);
        const metaResultPromise = waitForEmbeddedSignupResult();
        const codePromise = loginWithEmbeddedSignup(fb, session.configId);
        const [metaResult, code] = await Promise.all([metaResultPromise, codePromise]);
        const result = await completeWhatsAppEmbeddedSignupAction({
          sessionId: session.sessionId,
          stateToken: session.stateToken,
          code,
          wabaId: metaResult.wabaId,
          phoneNumberId: metaResult.phoneNumberId,
          businessId: metaResult.businessId,
        });
        setMessage(result.displayPhoneNumber ? `WhatsApp ${result.displayPhoneNumber} conectado com sucesso.` : "WhatsApp conectado com sucesso.");
        window.location.reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível concluir a conexão com a Meta.");
      }
    });
  }

  function disconnect() {
    if (!window.confirm("Desconectar este WhatsApp do PedeAqui? O histórico de conversas e pedidos será preservado.")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await disconnectWhatsAppAction();
        window.location.reload();
      } catch {
        setMessage("Não foi possível desconectar o WhatsApp agora.");
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: 12, padding: 16, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Conexão oficial da Meta</p>
          <strong style={{ fontSize: 18 }}>{humanStatus(status)}</strong>
        </div>
        {connected ? <span style={{ fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>Pronto para atender</span> : null}
      </div>

      {connected ? (
        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {status.verified_name ? <span>Nome verificado: <strong>{status.verified_name}</strong></span> : null}
          {status.display_phone_number ? <span>Número: <strong>{status.display_phone_number}</strong></span> : null}
          {status.quality_rating ? <span>Qualidade: <strong>{status.quality_rating}</strong></span> : null}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          O proprietário autoriza o próprio WhatsApp em uma janela oficial da Meta. O PedeAqui configura o número, webhook e conexão automaticamente.
        </p>
      )}

      {!platformReady ? (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>O recurso está preparado no PedeAqui, mas a configuração de Embedded Signup do app Meta ainda precisa ser concluída.</p>
      ) : null}

      {status.last_connection_error_kind ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>A última tentativa precisa de atenção. Você pode iniciar a conexão novamente.</p> : null}
      {status.meta_billing_mode === "unconfigured" && connected ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>A conexão técnica está ativa. O modelo de cobrança da mensageria Meta ainda precisa ser definido antes da liberação comercial ampla.</p> : null}
      {message ? <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{message}</p> : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button type="button" onClick={connect} disabled={pending || !platformReady}>
          {pending ? "Conectando…" : connected ? "Reconectar WhatsApp" : "Conectar meu WhatsApp"}
        </Button>
        {connected ? <Button type="button" variant="secondary" onClick={disconnect} disabled={pending}>Desconectar</Button> : null}
      </div>
    </div>
  );
}
