import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  certifyMetaWhatsAppWebhookSubscription,
  type MetaAppWebhookSubscriptionsResponse,
} from "@/server/conversations/meta-app-webhook-subscription";
import {
  summarizeWebhookReceiptKinds,
  type MetaSubscriptionStatus,
} from "@/server/conversations/coexistence-observability-model";
import { resolveWhatsAppAppSecret, resolveWhatsAppGraphVersion } from "@/server/conversations/provider";
import type { WhatsAppParsedEvent } from "@/server/conversations/whatsapp-webhook";
import { recordFailure } from "@/server/observability/failure";

const TABLE = "whatsapp_coexistence_observability";
const APP_WEBHOOK_CHECK_TTL_MS = 15 * 60 * 1000;
const appWebhookCheckCache = new Map<string, number>();

type RoutingRow = {
  organization_id: string;
  store_id: string;
  whatsapp_phone_number_id: string | null;
  app_secret_secret_ref: string | null;
};

type MetaAppWebhookGraphPayload = MetaAppWebhookSubscriptionsResponse & {
  error?: { code?: number; message?: string; type?: string };
};

type AppWebhookInspection = {
  status: MetaSubscriptionStatus;
  errorKind: string | null;
  fields: string[];
};

export type WhatsAppCoexistenceObservabilitySnapshot = {
  telemetryAvailable: boolean;
  subscriptionStatus: MetaSubscriptionStatus;
  subscriptionCheckedAt: string | null;
  lastSubscriptionErrorKind: string | null;
  appWebhookStatus: MetaSubscriptionStatus;
  appWebhookCheckedAt: string | null;
  appWebhookFields: string[];
  lastAppWebhookErrorKind: string | null;
  lastMessagesWebhookAt: string | null;
  lastEchoWebhookAt: string | null;
  lastEchoPersistedAt: string | null;
  lastIngestErrorKind: string | null;
  lastIngestErrorAt: string | null;
};

const EMPTY_SNAPSHOT: WhatsAppCoexistenceObservabilitySnapshot = {
  telemetryAvailable: false,
  subscriptionStatus: "unknown",
  subscriptionCheckedAt: null,
  lastSubscriptionErrorKind: null,
  appWebhookStatus: "unknown",
  appWebhookCheckedAt: null,
  appWebhookFields: [],
  lastAppWebhookErrorKind: null,
  lastMessagesWebhookAt: null,
  lastEchoWebhookAt: null,
  lastEchoPersistedAt: null,
  lastIngestErrorKind: null,
  lastIngestErrorAt: null,
};

function failureContext(requestId: string | undefined, organizationId?: string, storeId?: string) {
  return requestId ? { requestId, organizationId, storeId } : null;
}

async function safeUpsert(
  row: Record<string, unknown> & { organization_id: string; store_id: string },
  event: string,
  requestId?: string,
) {
  try {
    const { error } = await createAdminClient().from(TABLE).upsert(row, { onConflict: "store_id" });
    if (error) throw error;
    return true;
  } catch (error) {
    const context = failureContext(requestId, row.organization_id, row.store_id);
    if (context) recordFailure(event, error, context);
    return false;
  }
}

function isFreshCheck(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp < APP_WEBHOOK_CHECK_TTL_MS;
}

async function inspectMetaAppWebhookSubscription(appSecretSecretRef: string | null): Promise<AppWebhookInspection> {
  const appId = process.env.META_APP_ID?.trim();
  if (!appId) {
    return { status: "action_required", errorKind: "platform_configuration_missing", fields: [] };
  }

  try {
    const graphVersion = resolveWhatsAppGraphVersion();
    const appSecret = resolveWhatsAppAppSecret(appSecretSecretRef);
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(appId)}/subscriptions`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${appId}|${appSecret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const payload = await response.json().catch(() => null) as MetaAppWebhookGraphPayload | null;
    if (!response.ok || !payload) {
      const message = payload?.error?.message?.toLowerCase() ?? "";
      const unsupported = message.includes("unsupported") || message.includes("not supported");
      return {
        status: unsupported ? "not_supported" : "action_required",
        errorKind: payload?.error?.code == null
          ? `meta_app_webhook_http_${response.status}`
          : `meta_app_webhook_${payload.error.code}`,
        fields: [],
      };
    }
    return certifyMetaWhatsAppWebhookSubscription(payload);
  } catch {
    return { status: "action_required", errorKind: "meta_app_webhook_check_failed", fields: [] };
  }
}

async function maybeRecordAppWebhookSubscription(settings: RoutingRow, requestId: string) {
  const cachedAt = appWebhookCheckCache.get(settings.store_id);
  if (cachedAt && Date.now() - cachedAt < APP_WEBHOOK_CHECK_TTL_MS) return;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from(TABLE)
      .select("app_webhook_checked_at")
      .eq("organization_id", settings.organization_id)
      .eq("store_id", settings.store_id)
      .maybeSingle();
    if (error) throw error;

    if (isFreshCheck(data?.app_webhook_checked_at ?? null)) {
      appWebhookCheckCache.set(settings.store_id, Date.now());
      return;
    }

    const inspection = await inspectMetaAppWebhookSubscription(settings.app_secret_secret_ref);
    const now = new Date().toISOString();
    const recorded = await safeUpsert({
      organization_id: settings.organization_id,
      store_id: settings.store_id,
      app_webhook_status: inspection.status,
      app_webhook_checked_at: now,
      app_webhook_fields: inspection.fields,
      last_app_webhook_error_kind: inspection.errorKind,
      updated_at: now,
    }, "whatsapp.coexistence_observability.app_webhook_check_failed", requestId);
    if (recorded) appWebhookCheckCache.set(settings.store_id, Date.now());
  } catch (error) {
    recordFailure("whatsapp.coexistence_observability.app_webhook_check_failed", error, {
      requestId,
      organizationId: settings.organization_id,
      storeId: settings.store_id,
    });
  }
}

export class WhatsAppCoexistenceObservability {
  static async recordWebhookReceipt(events: readonly WhatsAppParsedEvent[], requestId: string) {
    const relevant = events.filter((event) => event.kind === "message" || event.kind === "echo");
    if (relevant.length === 0) return;

    const phoneNumberIds = [...new Set(relevant.map((event) => event.phoneNumberId))];
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.from("store_conversation_settings")
        .select("organization_id, store_id, whatsapp_phone_number_id, app_secret_secret_ref")
        .eq("provider", "meta_cloud")
        .eq("whatsapp_enabled", true)
        .eq("connection_mode", "coexistence")
        .in("whatsapp_phone_number_id", phoneNumberIds);
      if (error) throw error;

      const now = new Date().toISOString();
      const settingsRows = (data ?? []) as RoutingRow[];
      const rows = settingsRows.flatMap((settings) => {
        if (!settings.whatsapp_phone_number_id) return [];
        const flags = summarizeWebhookReceiptKinds(
          relevant.filter((event) => event.phoneNumberId === settings.whatsapp_phone_number_id).map((event) => event.kind),
        );
        if (!flags.messages && !flags.echo) return [];
        return [{
          organization_id: settings.organization_id,
          store_id: settings.store_id,
          ...(flags.messages ? { last_messages_webhook_at: now } : {}),
          ...(flags.echo ? { last_echo_webhook_at: now } : {}),
          updated_at: now,
        }];
      });
      if (rows.length === 0) return;
      const { error: writeError } = await admin.from(TABLE).upsert(rows, { onConflict: "store_id" });
      if (writeError) throw writeError;

      for (const settings of settingsRows) {
        await maybeRecordAppWebhookSubscription(settings, requestId);
      }
    } catch (error) {
      recordFailure("whatsapp.coexistence_observability.webhook_receipt_failed", error, { requestId });
    }
  }

  static async recordEchoPersisted(organizationId: string, storeId: string, requestId?: string) {
    const now = new Date().toISOString();
    await safeUpsert({
      organization_id: organizationId,
      store_id: storeId,
      last_echo_persisted_at: now,
      last_ingest_error_kind: null,
      last_ingest_error_at: null,
      updated_at: now,
    }, "whatsapp.coexistence_observability.echo_persisted_failed", requestId);
  }

  static async recordEchoIngestFailure(
    organizationId: string,
    storeId: string,
    errorKind: string,
    requestId?: string,
  ) {
    const now = new Date().toISOString();
    await safeUpsert({
      organization_id: organizationId,
      store_id: storeId,
      last_ingest_error_kind: errorKind.slice(0, 120),
      last_ingest_error_at: now,
      updated_at: now,
    }, "whatsapp.coexistence_observability.ingest_failure_marker_failed", requestId);
  }

  static async recordSubscriptionCheck(
    organizationId: string,
    storeId: string,
    status: MetaSubscriptionStatus,
    errorKind: string | null,
  ) {
    const now = new Date().toISOString();
    await safeUpsert({
      organization_id: organizationId,
      store_id: storeId,
      subscription_status: status,
      subscription_checked_at: now,
      last_subscription_error_kind: errorKind?.slice(0, 120) ?? null,
      updated_at: now,
    }, "whatsapp.coexistence_observability.subscription_marker_failed");
  }

  static async load(organizationId: string, storeId: string): Promise<WhatsAppCoexistenceObservabilitySnapshot> {
    try {
      const { data, error } = await createAdminClient().from(TABLE)
        .select("subscription_status, subscription_checked_at, last_subscription_error_kind, app_webhook_status, app_webhook_checked_at, app_webhook_fields, last_app_webhook_error_kind, last_messages_webhook_at, last_echo_webhook_at, last_echo_persisted_at, last_ingest_error_kind, last_ingest_error_at")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { ...EMPTY_SNAPSHOT, telemetryAvailable: true };
      return {
        telemetryAvailable: true,
        subscriptionStatus: (data.subscription_status ?? "unknown") as MetaSubscriptionStatus,
        subscriptionCheckedAt: data.subscription_checked_at ?? null,
        lastSubscriptionErrorKind: data.last_subscription_error_kind ?? null,
        appWebhookStatus: (data.app_webhook_status ?? "unknown") as MetaSubscriptionStatus,
        appWebhookCheckedAt: data.app_webhook_checked_at ?? null,
        appWebhookFields: Array.isArray(data.app_webhook_fields) ? data.app_webhook_fields : [],
        lastAppWebhookErrorKind: data.last_app_webhook_error_kind ?? null,
        lastMessagesWebhookAt: data.last_messages_webhook_at ?? null,
        lastEchoWebhookAt: data.last_echo_webhook_at ?? null,
        lastEchoPersistedAt: data.last_echo_persisted_at ?? null,
        lastIngestErrorKind: data.last_ingest_error_kind ?? null,
        lastIngestErrorAt: data.last_ingest_error_at ?? null,
      };
    } catch {
      return { ...EMPTY_SNAPSHOT };
    }
  }
}
