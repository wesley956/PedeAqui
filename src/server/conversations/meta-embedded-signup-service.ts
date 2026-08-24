import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { isWhatsAppConnectionMode, type WhatsAppConnectionMode } from "@/features/conversations/whatsapp-connection-model";
import {
  WhatsAppCloudProvider,
  WhatsAppProviderError,
  resolveWhatsAppAccessToken,
  resolveWhatsAppAppSecret,
  resolveWhatsAppGraphVersion,
} from "@/server/conversations/provider";

const idSchema = z.string().trim().regex(/^[0-9]{3,40}$/);
const modeSchema = z.enum(["coexistence", "cloud_api"]);
const completeSchema = z.object({
  sessionId: z.string().uuid(),
  stateToken: z.string().min(32).max(256),
  code: z.string().min(8).max(4096),
  wabaId: idSchema,
  phoneNumberId: idSchema.nullable().optional(),
  businessId: idSchema.nullable().optional(),
  mode: modeSchema,
});
const ACTIVE_SESSION_STATES = ["starting", "awaiting_meta", "authorizing", "configuring_assets", "subscribing_webhooks", "registering_phone", "health_checking"] as const;
const HEALTH_STALE_MS = 15 * 60_000;

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para conectar o WhatsApp.");
  return storeId;
}
function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Meta platform configuration missing: ${name}`);
  return value;
}
function stateHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function resolveSessionInfoVersion() {
  const value = process.env.META_EMBEDDED_SIGNUP_SESSION_INFO_VERSION?.trim() || "3";
  return /^\d{1,2}$/.test(value) ? value : "3";
}
function resolveConfigId(mode: WhatsAppConnectionMode) {
  if (mode === "coexistence") {
    return process.env.META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID?.trim()
      || process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim()
      || null;
  }
  return process.env.META_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;
}

class MetaGraphError extends Error {
  constructor(public readonly status: number, public readonly code: string | null) {
    super("Meta Graph API request failed");
    this.name = "MetaGraphError";
  }
}
type GraphErrorPayload = { error?: { code?: number; message?: string; type?: string } };
function safeMetaErrorKind(error: unknown) {
  if (error instanceof MetaGraphError) return error.code ? `meta_${error.code}` : `meta_http_${error.status}`;
  if (error instanceof WhatsAppProviderError) return error.providerCode ? `meta_${error.providerCode}` : `meta_http_${error.status}`;
  if (error instanceof Error && error.message.startsWith("Meta platform configuration missing:")) return "platform_configuration_missing";
  return "embedded_signup_failed";
}

async function graphRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://graph.facebook.com/${resolveWhatsAppGraphVersion()}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as (T & GraphErrorPayload) | null;
  if (!response.ok || !payload) throw new MetaGraphError(response.status, payload?.error?.code == null ? null : String(payload.error.code));
  return payload;
}

async function exchangeEmbeddedSignupCode(code: string) {
  const url = new URL(`https://graph.facebook.com/${resolveWhatsAppGraphVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", requiredEnv("META_APP_ID"));
  url.searchParams.set("client_secret", resolveWhatsAppAppSecret());
  url.searchParams.set("code", code);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => null) as { access_token?: string; error?: { code?: number } } | null;
  if (!response.ok || !payload?.access_token) throw new MetaGraphError(response.status, payload?.error?.code == null ? null : String(payload.error.code));
  return payload.access_token;
}

async function resolveAuthorizedPhoneNumber(wabaId: string, suppliedPhoneNumberId: string | null | undefined, onboardingToken: string) {
  const result = await graphRequest<{ data?: Array<{ id?: string }> }>(`${encodeURIComponent(wabaId)}/phone_numbers?fields=id`, onboardingToken);
  const ids = (result.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id && /^\d{3,40}$/.test(id)));
  if (suppliedPhoneNumberId) {
    if (!ids.includes(suppliedPhoneNumberId)) throw new MetaGraphError(409, "phone_waba_mismatch");
    return suppliedPhoneNumberId;
  }
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new MetaGraphError(409, "waba_without_phone");
  throw new MetaGraphError(409, "phone_selection_ambiguous");
}

async function assignPedeAquiSystemUser(wabaId: string) {
  const systemUserId = requiredEnv("META_SYSTEM_USER_ID");
  const providerBusinessId = requiredEnv("META_BUSINESS_ID");
  const adminToken = requiredEnv("META_SYSTEM_USER_ACCESS_TOKEN");
  const assigned = await graphRequest<{ data?: Array<{ id?: string }> }>(`${encodeURIComponent(wabaId)}/assigned_users?business=${encodeURIComponent(providerBusinessId)}`, adminToken);
  if (!assigned.data?.some((user) => user.id === systemUserId)) {
    const query = new URLSearchParams({ user: systemUserId, tasks: JSON.stringify(["MANAGE"]) });
    await graphRequest<Record<string, unknown>>(`${encodeURIComponent(wabaId)}/assigned_users?${query.toString()}`, adminToken, { method: "POST" });
  }
  return adminToken;
}
async function subscribePedeAquiApp(wabaId: string, systemToken: string) {
  await graphRequest<Record<string, unknown>>(`${encodeURIComponent(wabaId)}/subscribed_apps`, systemToken, { method: "POST", body: JSON.stringify({}) });
}
async function registerPhone(phoneNumberId: string, pin: string, systemToken: string) {
  await graphRequest<Record<string, unknown>>(`${encodeURIComponent(phoneNumberId)}/register`, systemToken, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}
async function updateSession(sessionId: string, values: Record<string, unknown>) {
  const { error } = await createAdminClient().from("whatsapp_embedded_signup_sessions").update({ ...values, updated_at: new Date().toISOString() }).eq("id", sessionId);
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
    const ready = Boolean(
      appId && configId && graphVersion
      && process.env.META_BUSINESS_ID?.trim()
      && process.env.META_SYSTEM_USER_ID?.trim()
      && process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()
      && process.env.WHATSAPP_APP_SECRET?.trim(),
    );
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
    const selection = "connection_status, onboarding_status, whatsapp_enabled, connection_mode, whatsapp_phone_number_id, access_token_secret_ref, display_phone_number, verified_name, quality_rating, connected_at, last_health_check_at, last_connection_error_kind, meta_billing_mode";
    const { data, error } = await admin.from("store_conversation_settings").select(selection).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (error) throw error;
    if (!data) return {
      connection_status: "not_connected", onboarding_status: "not_started", whatsapp_enabled: false,
      connection_mode: "coexistence" as WhatsAppConnectionMode, display_phone_number: null, verified_name: null,
      quality_rating: null, connected_at: null, last_health_check_at: null, last_connection_error_kind: null,
      meta_billing_mode: "unconfigured",
    };

    const status = { ...data } as typeof data & { connection_mode: WhatsAppConnectionMode };
    const lastHealth = status.last_health_check_at ? Date.parse(status.last_health_check_at) : 0;
    const shouldCheck = status.whatsapp_enabled && status.connection_status === "connected"
      && Boolean(status.whatsapp_phone_number_id && status.access_token_secret_ref)
      && (!Number.isFinite(lastHealth) || Date.now() - lastHealth > HEALTH_STALE_MS);

    if (!shouldCheck) return status;
    const now = new Date().toISOString();
    try {
      const token = resolveWhatsAppAccessToken(status.access_token_secret_ref);
      const phone = await new WhatsAppCloudProvider(token).inspectPhoneNumber(status.whatsapp_phone_number_id!);
      const updates = {
        connection_status: "connected",
        display_phone_number: phone.displayPhoneNumber,
        verified_name: phone.verifiedName,
        quality_rating: phone.qualityRating ?? "UNKNOWN",
        last_health_check_at: now,
        last_connection_error_kind: null,
        updated_at: now,
      };
      await admin.from("store_conversation_settings").update(updates).eq("organization_id", context.organizationId).eq("store_id", storeId);
      return { ...status, ...updates };
    } catch (healthError) {
      const retryable = healthError instanceof WhatsAppProviderError && healthError.retryable;
      const updates = {
        connection_status: retryable ? "temporarily_unavailable" : "action_required",
        last_health_check_at: now,
        last_connection_error_kind: safeMetaErrorKind(healthError),
        updated_at: now,
      };
      await admin.from("store_conversation_settings").update(updates).eq("organization_id", context.organizationId).eq("store_id", storeId);
      return { ...status, ...updates };
    }
  }

  static async start(modeInput: unknown) {
    const mode = modeSchema.parse(modeInput);
    const config = this.publicConfig();
    const configId = resolveConfigId(mode);
    if (!config.ready || !config.appId || !config.graphVersion || !configId) throw new Error(config.reason ?? "Embedded Signup indisponível.");
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const now = new Date();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const { error: cancelError } = await admin.from("whatsapp_embedded_signup_sessions")
      .update({ status: "canceled", updated_at: now.toISOString() })
      .eq("organization_id", context.organizationId).eq("store_id", storeId).in("status", [...ACTIVE_SESSION_STATES]);
    if (cancelError) throw cancelError;
    const { data: session, error } = await admin.from("whatsapp_embedded_signup_sessions").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      initiated_by: context.userId,
      state_token_sha256: stateHash(token),
      connection_mode: mode,
      status: "awaiting_meta",
      expires_at: expiresAt,
    }).select("id").single();
    if (error) throw error;
    const { error: statusError } = await admin.from("store_conversation_settings").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      onboarding_status: "awaiting_meta",
      last_connection_error_kind: null,
      updated_by: context.userId,
      updated_at: now.toISOString(),
    }, { onConflict: "store_id" });
    if (statusError) throw statusError;
    return {
      sessionId: session.id,
      stateToken: token,
      appId: config.appId,
      configId,
      graphVersion: config.graphVersion,
      sessionInfoVersion: resolveSessionInfoVersion(),
      mode,
    };
  }

  static async complete(input: unknown) {
    const values = completeSchema.parse(input);
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: session, error: sessionError } = await admin.from("whatsapp_embedded_signup_sessions")
      .select("id, state_token_sha256, status, expires_at, connection_mode")
      .eq("id", values.sessionId).eq("organization_id", context.organizationId).eq("store_id", storeId).eq("initiated_by", context.userId).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new Error("Sessão de conexão não encontrada.");
    if (!ACTIVE_SESSION_STATES.includes(session.status as (typeof ACTIVE_SESSION_STATES)[number])) throw new Error("Sessão de conexão já encerrada.");
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await updateSession(values.sessionId, { status: "expired", error_kind: "session_expired" });
      throw new Error("A sessão da Meta expirou. Inicie a conexão novamente.");
    }
    if (stateHash(values.stateToken) !== session.state_token_sha256) throw new Error("Sessão de conexão inválida.");
    if (!isWhatsAppConnectionMode(session.connection_mode) || session.connection_mode !== values.mode) throw new Error("Modo de conexão inválido para esta sessão.");
    const mode = session.connection_mode;
    const { data: prior } = await admin.from("store_conversation_settings").select("connection_status").eq("store_id", storeId).maybeSingle();

    try {
      await updateSession(values.sessionId, {
        status: "authorizing",
        waba_id: values.wabaId,
        phone_number_id: values.phoneNumberId ?? null,
        meta_business_id: values.businessId ?? null,
      });
      const onboardingToken = await exchangeEmbeddedSignupCode(values.code);
      await updateSession(values.sessionId, { status: "configuring_assets" });
      const phoneNumberId = await resolveAuthorizedPhoneNumber(values.wabaId, values.phoneNumberId, onboardingToken);
      await updateSession(values.sessionId, { phone_number_id: phoneNumberId });

      const { data: existingPhone, error: duplicateError } = await admin.from("store_conversation_settings")
        .select("store_id").eq("whatsapp_phone_number_id", phoneNumberId).neq("store_id", storeId).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (existingPhone) throw new Error("Este número já está conectado a outra unidade do PedeAqui.");

      const systemToken = await assignPedeAquiSystemUser(values.wabaId);
      await updateSession(values.sessionId, { status: "subscribing_webhooks" });
      await subscribePedeAquiApp(values.wabaId, systemToken);

      if (mode === "cloud_api") {
        await updateSession(values.sessionId, { status: "registering_phone" });
        const registrationPin = String(Number.parseInt(randomBytes(4).toString("hex"), 16) % 1_000_000).padStart(6, "0");
        await registerPhone(phoneNumberId, registrationPin, systemToken);
        const { error: pinError } = await admin.rpc("whatsapp_channel_store_registration_pin_internal", {
          p_store_id: storeId,
          p_registration_pin: registrationPin,
        });
        if (pinError) throw pinError;
      }

      await updateSession(values.sessionId, { status: "health_checking" });
      const phone = await new WhatsAppCloudProvider(systemToken).inspectPhoneNumber(phoneNumberId);
      const now = new Date().toISOString();
      const { error: saveError } = await admin.from("store_conversation_settings").upsert({
        organization_id: context.organizationId,
        store_id: storeId,
        provider: "meta_cloud",
        whatsapp_enabled: true,
        connection_mode: mode,
        whatsapp_phone_number_id: phoneNumberId,
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
        after: { provider: "meta_cloud", connection_mode: mode, phone_number_id: phoneNumberId, waba_id: values.wabaId, connection_status: "connected" },
      });
      return { ok: true, displayPhoneNumber: phone.displayPhoneNumber, verifiedName: phone.verifiedName, connectionMode: mode };
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
