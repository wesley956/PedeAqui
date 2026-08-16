import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { WhatsAppCloudProvider, resolveWhatsAppAppSecret, resolveWhatsAppGraphVersion } from "@/server/conversations/provider";

const idSchema = z.string().trim().regex(/^[0-9]{3,40}$/);
const completeSchema = z.object({
  sessionId: z.string().uuid(),
  stateToken: z.string().min(32).max(256),
  code: z.string().min(8).max(4096),
  wabaId: idSchema,
  phoneNumberId: idSchema,
  businessId: idSchema.nullable().optional(),
});

const ACTIVE_SESSION_STATES = [
  "starting", "awaiting_meta", "authorizing", "configuring_assets",
  "subscribing_webhooks", "registering_phone", "health_checking",
] as const;

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para conectar o WhatsApp.");
  return storeId;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Meta platform configuration missing: ${name}`);
  return value;
}

function safeMetaErrorKind(error: unknown) {
  if (error instanceof MetaGraphError) return error.code ? `meta_${error.code}` : `meta_http_${error.status}`;
  if (error instanceof Error && error.message.startsWith("Meta platform configuration missing:")) return "platform_configuration_missing";
  return "embedded_signup_failed";
}

function stateHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

class MetaGraphError extends Error {
  constructor(public readonly status: number, public readonly code: string | null, message = "Meta Graph API request failed") {
    super(message);
    this.name = "MetaGraphError";
  }
}

type GraphErrorPayload = { error?: { code?: number; message?: string; type?: string } };

async function graphRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const version = resolveWhatsAppGraphVersion();
  const response = await fetch(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as (T & GraphErrorPayload) | null;
  if (!response.ok || !payload) {
    const code = payload?.error?.code == null ? null : String(payload.error.code);
    throw new MetaGraphError(response.status, code);
  }
  return payload;
}

async function exchangeEmbeddedSignupCode(code: string) {
  const appId = requiredEnv("META_APP_ID");
  const appSecret = resolveWhatsAppAppSecret();
  const version = resolveWhatsAppGraphVersion();
  const url = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  const response = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => null) as { access_token?: string; error?: { code?: number } } | null;
  if (!response.ok || !payload?.access_token) {
    throw new MetaGraphError(response.status, payload?.error?.code == null ? null : String(payload.error.code));
  }
  return payload.access_token;
}

async function verifyPhoneBelongsToWaba(wabaId: string, phoneNumberId: string, onboardingToken: string) {
  const result = await graphRequest<{ data?: Array<{ id?: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }> }>(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
    onboardingToken,
  );
  const phone = result.data?.find((item) => item.id === phoneNumberId);
  if (!phone) throw new MetaGraphError(409, "phone_waba_mismatch");
  return phone;
}

async function assignPedeAquiSystemUser(wabaId: string) {
  const systemUserId = requiredEnv("META_SYSTEM_USER_ID");
  const adminToken = requiredEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  const query = new URLSearchParams({ user: systemUserId, tasks: JSON.stringify(["MANAGE"]) });
  await graphRequest<Record<string, unknown>>(
    `${encodeURIComponent(wabaId)}/assigned_users?${query.toString()}`,
    adminToken,
    { method: "POST" },
  );
  return adminToken;
}

async function subscribePedeAquiApp(wabaId: string, systemToken: string) {
  await graphRequest<Record<string, unknown>>(
    `${encodeURIComponent(wabaId)}/subscribed_apps`,
    systemToken,
    { method: "POST", body: JSON.stringify({}) },
  );
}

async function registerPhone(phoneNumberId: string, pin: string, systemToken: string) {
  await graphRequest<Record<string, unknown>>(
    `${encodeURIComponent(phoneNumberId)}/register`,
    systemToken,
    { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }) },
  );
}

async function updateSession(sessionId: string, values: Record<string, unknown>) {
  const admin = createAdminClient();
  const { error } = await admin.from("whatsapp_embedded_signup_sessions")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

export type EmbeddedSignupPublicConfig = {
  ready: boolean;
  appId: string | null;
  configId: string | null;
  graphVersion: string | null;
  reason: string | null;
};

export class MetaEmbeddedSignupService {
  static publicConfig(): EmbeddedSignupPublicConfig {
    const appId = process.env.META_APP_ID?.trim() || null;
    const configId = process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;
    const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || null;
    const systemUserId = process.env.META_SYSTEM_USER_ID?.trim() || null;
    const systemToken = process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim() || null;
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim() || null;
    const ready = Boolean(appId && configId && graphVersion && systemUserId && systemToken && appSecret);
    return {
      ready,
      appId: ready ? appId : null,
      configId: ready ? configId : null,
      graphVersion: ready ? graphVersion : null,
      reason: ready ? null : "O PedeAqui ainda precisa concluir a configuração do Embedded Signup na Meta.",
    };
  }

  static async currentStatus() {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_conversation_settings")
      .select("connection_status, onboarding_status, whatsapp_enabled, display_phone_number, verified_name, quality_rating, connected_at, last_health_check_at, last_connection_error_kind, meta_billing_mode")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    return data ?? {
      connection_status: "not_connected",
      onboarding_status: "not_started",
      whatsapp_enabled: false,
      display_phone_number: null,
      verified_name: null,
      quality_rating: null,
      connected_at: null,
      last_health_check_at: null,
      last_connection_error_kind: null,
      meta_billing_mode: "unconfigured",
    };
  }

  static async start() {
    const config = this.publicConfig();
    if (!config.ready || !config.appId || !config.configId || !config.graphVersion) throw new Error(config.reason ?? "Embedded Signup indisponível.");
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();

    await admin.from("whatsapp_embedded_signup_sessions")
      .update({ status: "canceled", updated_at: now.toISOString() })
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("status", [...ACTIVE_SESSION_STATES]);

    const { data: session, error } = await admin.from("whatsapp_embedded_signup_sessions")
      .insert({
        organization_id: context.organizationId,
        store_id: storeId,
        initiated_by: context.userId,
        state_token_sha256: stateHash(token),
        status: "awaiting_meta",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw error;

    await admin.from("store_conversation_settings").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      onboarding_status: "awaiting_meta",
      last_connection_error_kind: null,
      updated_by: context.userId,
      updated_at: now.toISOString(),
    }, { onConflict: "store_id" });

    return { sessionId: session.id, stateToken: token, ...config };
  }

  static async complete(input: unknown) {
    const values = completeSchema.parse(input);
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: session, error: sessionError } = await admin.from("whatsapp_embedded_signup_sessions")
      .select("id, organization_id, store_id, initiated_by, state_token_sha256, status, expires_at")
      .eq("id", values.sessionId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("initiated_by", context.userId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Sessão de conexão não encontrada.");
    if (!ACTIVE_SESSION_STATES.includes(session.status as (typeof ACTIVE_SESSION_STATES)[number])) throw new Error("Sessão de conexão já encerrada.");
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await updateSession(values.sessionId, { status: "expired", error_kind: "session_expired" });
      throw new Error("A sessão da Meta expirou. Inicie a conexão novamente.");
    }
    if (stateHash(values.stateToken) !== session.state_token_sha256) throw new Error("Sessão de conexão inválida.");

    const { data: existingPhone } = await admin.from("store_conversation_settings")
      .select("store_id")
      .eq("whatsapp_phone_number_id", values.phoneNumberId)
      .neq("store_id", storeId)
      .maybeSingle();
    if (existingPhone) throw new Error("Este número já está conectado a outra unidade do PedeAqui.");

    const { data: prior } = await admin.from("store_conversation_settings")
      .select("connection_status")
      .eq("store_id", storeId)
      .maybeSingle();

    try {
      await updateSession(values.sessionId, { status: "authorizing", waba_id: values.wabaId, phone_number_id: values.phoneNumberId, meta_business_id: values.businessId ?? null });
      const onboardingToken = await exchangeEmbeddedSignupCode(values.code);

      await updateSession(values.sessionId, { status: "configuring_assets" });
      await verifyPhoneBelongsToWaba(values.wabaId, values.phoneNumberId, onboardingToken);
      const systemToken = await assignPedeAquiSystemUser(values.wabaId);

      await updateSession(values.sessionId, { status: "subscribing_webhooks" });
      await subscribePedeAquiApp(values.wabaId, systemToken);

      await updateSession(values.sessionId, { status: "registering_phone" });
      const registrationPin = String(Number.parseInt(randomBytes(4).toString("hex"), 16) % 1_000_000).padStart(6, "0");
      await registerPhone(values.phoneNumberId, registrationPin, systemToken);
      const { error: pinError } = await admin.rpc("whatsapp_channel_store_registration_pin_internal", {
        p_store_id: storeId,
        p_registration_pin: registrationPin,
      });
      if (pinError) throw pinError;

      await updateSession(values.sessionId, { status: "health_checking" });
      const phone = await new WhatsAppCloudProvider(systemToken).inspectPhoneNumber(values.phoneNumberId);
      const now = new Date().toISOString();
      const { error: saveError } = await admin.from("store_conversation_settings").upsert({
        organization_id: context.organizationId,
        store_id: storeId,
        provider: "meta_cloud",
        whatsapp_enabled: true,
        whatsapp_phone_number_id: values.phoneNumberId,
        whatsapp_business_account_id: values.wabaId,
        meta_business_id: values.businessId ?? null,
        access_token_secret_ref: "META_SYSTEM_USER_ACCESS_TOKEN",
        app_secret_secret_ref: "WHATSAPP_APP_SECRET",
        connection_status: "connected",
        onboarding_status: "completed",
        display_phone_number: phone.displayPhoneNumber,
        verified_name: phone.verifiedName,
        quality_rating: phone.qualityRating ?? "UNKNOWN",
        connected_at: now,
        last_health_check_at: now,
        last_connection_error_kind: null,
        updated_by: context.userId,
        updated_at: now,
      }, { onConflict: "store_id" });
      if (saveError) throw saveError;

      await updateSession(values.sessionId, { status: "completed", completed_at: now, error_kind: null });
      await AuditService.record(context, {
        action: "conversations.whatsapp_connected",
        entityType: "store_conversation_settings",
        entityId: storeId,
        after: { provider: "meta_cloud", phone_number_id: values.phoneNumberId, waba_id: values.wabaId, connection_status: "connected" },
      });
      return { ok: true, displayPhoneNumber: phone.displayPhoneNumber, verifiedName: phone.verifiedName };
    } catch (error) {
      const errorKind = safeMetaErrorKind(error);
      await updateSession(values.sessionId, { status: "failed", error_kind: errorKind }).catch(() => undefined);
      await admin.from("store_conversation_settings").upsert({
        organization_id: context.organizationId,
        store_id: storeId,
        onboarding_status: "failed",
        connection_status: prior?.connection_status === "connected" ? "connected" : "action_required",
        last_connection_error_kind: errorKind,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id" });
      throw error;
    }
  }

  static async disconnect() {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await admin.from("store_conversation_settings").update({
      whatsapp_enabled: false,
      connection_status: "disconnected",
      onboarding_status: "not_started",
      last_connection_error_kind: null,
      updated_by: context.userId,
      updated_at: now,
    }).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, {
      action: "conversations.whatsapp_disconnected",
      entityType: "store_conversation_settings",
      entityId: storeId,
      after: { whatsapp_enabled: false, connection_status: "disconnected" },
    });
    return { ok: true };
  }
}
