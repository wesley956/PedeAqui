import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WhatsAppCloudProvider,
  WhatsAppProviderError,
  resolveWhatsAppAccessToken,
  resolveWhatsAppAppSecret,
  resolveWhatsAppGraphVersion,
} from "@/server/conversations/provider";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const idSchema = z.string().trim().regex(/^[0-9]{3,40}$/);
const storeIdSchema = z.string().uuid();
const connectSchema = z.object({ storeId: storeIdSchema, wabaId: idSchema, phoneNumberId: idSchema });
const qualityRatings = new Set(["GREEN", "YELLOW", "RED", "UNKNOWN", "NA"]);

export type PlatformWhatsAppManualErrorCode =
  | "store_not_found"
  | "platform_token_missing"
  | "app_secret_missing"
  | "graph_version_missing"
  | "webhook_verify_token_missing"
  | "duplicate_phone"
  | "phone_not_in_waba"
  | "permanent_token_invalid"
  | "system_user_not_assigned"
  | "meta_unavailable"
  | "meta_rejected"
  | "missing_current_ids";

export class PlatformWhatsAppManualError extends Error {
  constructor(public readonly code: PlatformWhatsAppManualErrorCode, message: string) {
    super(message);
    this.name = "PlatformWhatsAppManualError";
  }
}

function manualEnvironmentStatus() {
  const missing: string[] = [];
  if (!process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()) missing.push("META_SYSTEM_USER_ACCESS_TOKEN");
  if (!process.env.WHATSAPP_APP_SECRET?.trim()) missing.push("WHATSAPP_APP_SECRET");
  if (!process.env.WHATSAPP_GRAPH_API_VERSION?.trim()) missing.push("WHATSAPP_GRAPH_API_VERSION");
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()) missing.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  return { ready: missing.length === 0, missing };
}

async function requireSuperAdmin() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

function permanentToken() {
  const env = manualEnvironmentStatus();
  if (!process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()) {
    throw new PlatformWhatsAppManualError("platform_token_missing", "O token técnico permanente do PedeAqui ainda não está configurado.");
  }
  if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
    throw new PlatformWhatsAppManualError("app_secret_missing", "O App Secret do WhatsApp ainda não está configurado no servidor.");
  }
  if (!process.env.WHATSAPP_GRAPH_API_VERSION?.trim()) {
    throw new PlatformWhatsAppManualError("graph_version_missing", "A versão da Graph API ainda não está configurada no servidor.");
  }
  if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()) {
    throw new PlatformWhatsAppManualError("webhook_verify_token_missing", "O token de verificação do webhook ainda não está configurado no servidor.");
  }
  void env;
  void resolveWhatsAppAppSecret("WHATSAPP_APP_SECRET");
  void resolveWhatsAppGraphVersion();
  return resolveWhatsAppAccessToken("META_SYSTEM_USER_ACCESS_TOKEN");
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
  if (response.ok && payload) return payload;
  if (response.status === 401) {
    throw new PlatformWhatsAppManualError("permanent_token_invalid", "O token técnico permanente foi recusado pela Meta.");
  }
  if (response.status === 403) {
    throw new PlatformWhatsAppManualError("system_user_not_assigned", "O System User do PedeAqui não possui acesso a esta conta do WhatsApp.");
  }
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    throw new PlatformWhatsAppManualError("meta_unavailable", "A Meta está temporariamente indisponível.");
  }
  throw new PlatformWhatsAppManualError("meta_rejected", "A Meta recusou a configuração informada.");
}

async function verifyPhoneBelongsToWaba(wabaId: string, phoneNumberId: string, token: string) {
  const result = await graphRequest<{ data?: Array<{ id?: string }> }>(
    `${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=200`,
    token,
  );
  if (!result.data?.some((item) => item.id === phoneNumberId)) {
    throw new PlatformWhatsAppManualError("phone_not_in_waba", "O Phone Number ID não pertence à WABA informada.");
  }
}

async function subscribePedeAquiApp(wabaId: string, token: string) {
  await graphRequest<Record<string, unknown>>(
    `${encodeURIComponent(wabaId)}/subscribed_apps`,
    token,
    { method: "POST", body: JSON.stringify({}) },
  );
}

function mapInspectionError(error: unknown): PlatformWhatsAppManualError {
  if (error instanceof PlatformWhatsAppManualError) return error;
  if (error instanceof WhatsAppProviderError) {
    if (error.status === 401) return new PlatformWhatsAppManualError("permanent_token_invalid", "O token técnico permanente foi recusado pela Meta.");
    if (error.status === 403) return new PlatformWhatsAppManualError("system_user_not_assigned", "O System User do PedeAqui não possui acesso a este número.");
    if (error.retryable) return new PlatformWhatsAppManualError("meta_unavailable", "A Meta está temporariamente indisponível.");
    return new PlatformWhatsAppManualError("meta_rejected", "A Meta recusou a validação deste número.");
  }
  return new PlatformWhatsAppManualError("meta_rejected", "Não foi possível validar o WhatsApp informado.");
}

async function markFailure(storeId: string, code: PlatformWhatsAppManualErrorCode) {
  const admin = createAdminClient();
  await admin.from("store_conversation_settings")
    .update({
      connection_status: "action_required",
      last_connection_error_kind: code,
      last_health_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", storeId)
    .then(() => undefined, () => undefined);
}

export class PlatformWhatsAppManualService {
  static environmentStatus() {
    return manualEnvironmentStatus();
  }

  static async load(rawStoreId: string) {
    const storeId = storeIdSchema.parse(rawStoreId);
    await requireSuperAdmin();
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id,organization_id,name,slug,status")
      .eq("id", storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) throw new PlatformWhatsAppManualError("store_not_found", "Unidade não encontrada.");
    const [{ data: organization, error: organizationError }, { data: settings, error: settingsError }] = await Promise.all([
      admin.from("organizations").select("id,name").eq("id", store.organization_id).maybeSingle(),
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled,whatsapp_phone_number_id,whatsapp_business_account_id,access_token_secret_ref,connection_status,onboarding_status,display_phone_number,verified_name,quality_rating,connected_at,last_health_check_at,last_connection_error_kind")
        .eq("store_id", storeId)
        .maybeSingle(),
    ]);
    if (organizationError) throw organizationError;
    if (settingsError) throw settingsError;
    const credentialMode = settings?.access_token_secret_ref === "META_SYSTEM_USER_ACCESS_TOKEN"
      ? "permanent"
      : settings?.access_token_secret_ref
        ? "legacy"
        : "missing";
    const lastHealthCheck = settings?.last_health_check_at ? new Date(settings.last_health_check_at) : null;
    const healthIsRecent = Boolean(lastHealthCheck && Date.now() - lastHealthCheck.getTime() <= 24 * 60 * 60 * 1000);
    return {
      store,
      organization,
      settings,
      credentialMode,
      healthIsRecent,
      environment: manualEnvironmentStatus(),
    } as const;
  }

  static async connect(rawInput: unknown) {
    const input = connectSchema.parse(rawInput);
    const { user } = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id,organization_id,name")
      .eq("id", input.storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) throw new PlatformWhatsAppManualError("store_not_found", "Unidade não encontrada.");

    const { data: duplicate, error: duplicateError } = await admin.from("store_conversation_settings")
      .select("store_id")
      .eq("whatsapp_phone_number_id", input.phoneNumberId)
      .neq("store_id", input.storeId)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new PlatformWhatsAppManualError("duplicate_phone", "Este número já está conectado a outra unidade do PedeAqui.");

    try {
      const token = permanentToken();
      await verifyPhoneBelongsToWaba(input.wabaId, input.phoneNumberId, token);
      await subscribePedeAquiApp(input.wabaId, token);
      const inspected = await new WhatsAppCloudProvider(token).inspectPhoneNumber(input.phoneNumberId);
      const now = new Date().toISOString();
      const qualityRating = inspected.qualityRating && qualityRatings.has(inspected.qualityRating)
        ? inspected.qualityRating
        : "UNKNOWN";
      const { error: saveError } = await admin.from("store_conversation_settings").upsert({
        organization_id: store.organization_id,
        store_id: input.storeId,
        whatsapp_enabled: true,
        provider: "meta_cloud",
        whatsapp_phone_number_id: input.phoneNumberId,
        whatsapp_business_account_id: input.wabaId,
        access_token_secret_ref: "META_SYSTEM_USER_ACCESS_TOKEN",
        app_secret_secret_ref: "WHATSAPP_APP_SECRET",
        connection_status: "connected",
        onboarding_status: "completed",
        display_phone_number: inspected.displayPhoneNumber,
        verified_name: inspected.verifiedName,
        quality_rating: qualityRating,
        connected_at: now,
        last_health_check_at: now,
        last_connection_error_kind: null,
        updated_by: user.id,
        updated_at: now,
      }, { onConflict: "store_id" });
      if (saveError) throw saveError;

      await admin.from("audit_logs").insert({
        organization_id: store.organization_id,
        store_id: input.storeId,
        actor_user_id: user.id,
        action: "platform.whatsapp_manual_connected",
        entity_type: "store_conversation_settings",
        entity_id: input.storeId,
        after_data: {
          waba_id: input.wabaId,
          phone_number_id: input.phoneNumberId,
          credential_mode: "META_SYSTEM_USER_ACCESS_TOKEN",
          connection_status: "connected",
          display_phone_number: inspected.displayPhoneNumber,
          verified_name: inspected.verifiedName,
          quality_rating: qualityRating,
        },
      });

      return {
        ok: true,
        displayPhoneNumber: inspected.displayPhoneNumber,
        verifiedName: inspected.verifiedName,
        qualityRating,
      } as const;
    } catch (error) {
      const safeError = mapInspectionError(error);
      await markFailure(input.storeId, safeError.code);
      throw safeError;
    }
  }

  static async revalidate(rawStoreId: string) {
    const storeId = storeIdSchema.parse(rawStoreId);
    const current = await this.load(storeId);
    const wabaId = current.settings?.whatsapp_business_account_id;
    const phoneNumberId = current.settings?.whatsapp_phone_number_id;
    if (!wabaId || !phoneNumberId) {
      throw new PlatformWhatsAppManualError("missing_current_ids", "Informe WABA ID e Phone Number ID antes de validar.");
    }
    return this.connect({ storeId, wabaId, phoneNumberId });
  }
}
