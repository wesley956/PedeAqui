import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import {
  classifyWhatsAppOperationalHealth,
  WHATSAPP_OPERATIONAL_RECENT_FAILURE_MS,
  type WhatsAppOperationalHealthState,
  type WhatsAppOperationalIssueCode,
} from "@/server/conversations/whatsapp-operational-health-model";

type TimestampRow = {
  provider_timestamp: string | null;
  created_at: string;
};

type ObservabilityRow = {
  subscription_status: string | null;
  subscription_checked_at: string | null;
  last_subscription_error_kind: string | null;
  app_webhook_status: string | null;
  app_webhook_checked_at: string | null;
  app_webhook_fields: string[] | null;
  last_app_webhook_error_kind: string | null;
  last_messages_webhook_at: string | null;
  last_echo_webhook_at: string | null;
  last_echo_persisted_at: string | null;
  last_ingest_error_kind: string | null;
  last_ingest_error_at: string | null;
  last_history_webhook_at: string | null;
  last_history_processed_at: string | null;
  last_history_imported_count: number | null;
  last_history_duplicate_count: number | null;
  last_history_phase: string | null;
  last_history_progress: string | null;
  last_history_error_kind: string | null;
  last_state_sync_webhook_at: string | null;
  last_state_sync_processed_at: string | null;
  last_state_sync_applied_count: number | null;
  last_state_sync_ignored_count: number | null;
  last_state_sync_error_kind: string | null;
};

export type WhatsAppOperationalHealthSnapshot = {
  state: WhatsAppOperationalHealthState;
  issues: WhatsAppOperationalIssueCode[];
  timezone: string;
  recentFailureWindowHours: 24;
  connection: {
    enabled: boolean;
    status: string | null;
    mode: string | null;
    onboardingStatus: string | null;
    qualityRating: string | null;
    connectedAt: string | null;
    lastHealthCheckAt: string | null;
    lastErrorKind: string | null;
  };
  webhook: {
    subscriptionStatus: string | null;
    subscriptionCheckedAt: string | null;
    appWebhookStatus: string | null;
    appWebhookCheckedAt: string | null;
    appWebhookFields: string[];
    lastMessagesWebhookAt: string | null;
    lastEchoWebhookAt: string | null;
    lastEchoPersistedAt: string | null;
    lastIngestErrorKind: string | null;
    lastIngestErrorAt: string | null;
  };
  sync: {
    lastHistoryWebhookAt: string | null;
    lastHistoryProcessedAt: string | null;
    historyImportedCount: number;
    historyDuplicateCount: number;
    historyPhase: string | null;
    historyProgress: string | null;
    lastHistoryErrorKind: string | null;
    lastStateSyncWebhookAt: string | null;
    lastStateSyncProcessedAt: string | null;
    stateSyncAppliedCount: number;
    stateSyncIgnoredCount: number;
    lastStateSyncErrorKind: string | null;
  };
  activity: {
    lastInboundAt: string | null;
    lastOutboundAt: string | null;
    waitingAgentCount: number;
  };
  queues: {
    outboundPending: number;
    outboundFailedRecent: number;
    mediaPending: number;
    mediaFailedRecent: number;
  };
};

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para consultar a saúde do WhatsApp.");
  return storeId;
}

function latestCanonicalTimestamp(rows: TimestampRow[] | null | undefined) {
  let latest: number | null = null;
  for (const row of rows ?? []) {
    const raw = row.provider_timestamp ?? row.created_at;
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) continue;
    latest = latest === null ? timestamp : Math.max(latest, timestamp);
  }
  return latest === null ? null : new Date(latest).toISOString();
}

function safeCount(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export class WhatsAppOperationalHealthService {
  static async load(): Promise<WhatsAppOperationalHealthSnapshot> {
    const context = await authorize(PERMISSIONS.INTEGRATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const now = new Date();
    const recentSince = new Date(now.getTime() - WHATSAPP_OPERATIONAL_RECENT_FAILURE_MS).toISOString();

    const [
      settingsResult,
      observabilityResult,
      inboundResult,
      outboundResult,
      outboundPendingResult,
      outboundFailedResult,
      mediaPendingResult,
      mediaFailedResult,
      waitingAgentResult,
    ] = await Promise.all([
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled,connection_status,connection_mode,onboarding_status,quality_rating,connected_at,last_health_check_at,last_connection_error_kind")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
      admin.from("whatsapp_coexistence_observability")
        .select("subscription_status,subscription_checked_at,last_subscription_error_kind,app_webhook_status,app_webhook_checked_at,app_webhook_fields,last_app_webhook_error_kind,last_messages_webhook_at,last_echo_webhook_at,last_echo_persisted_at,last_ingest_error_kind,last_ingest_error_at,last_history_webhook_at,last_history_processed_at,last_history_imported_count,last_history_duplicate_count,last_history_phase,last_history_progress,last_history_error_kind,last_state_sync_webhook_at,last_state_sync_processed_at,last_state_sync_applied_count,last_state_sync_ignored_count,last_state_sync_error_kind")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
      admin.from("messages")
        .select("provider_timestamp,created_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("messages")
        .select("provider_timestamp,created_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("direction", "outbound")
        .eq("delivery_status", "pending"),
      admin.from("messages")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("direction", "outbound")
        .eq("delivery_status", "failed")
        .gte("created_at", recentSince),
      admin.from("message_media")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .in("status", ["pending", "processing"]),
      admin.from("message_media")
        .select("failure_kind,updated_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("status", "failed")
        .gte("updated_at", recentSince)
        .limit(1000),
      admin.from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("status", "waiting_agent"),
    ]);

    const errors = [
      settingsResult.error,
      observabilityResult.error,
      inboundResult.error,
      outboundResult.error,
      outboundPendingResult.error,
      outboundFailedResult.error,
      mediaPendingResult.error,
      mediaFailedResult.error,
      waitingAgentResult.error,
    ].filter(Boolean);
    if (errors.length > 0) throw errors[0];

    const settings = settingsResult.data;
    const observability = observabilityResult.data as ObservabilityRow | null;
    const mediaFailedRecent = (mediaFailedResult.data ?? [])
      .filter((row) => row.failure_kind !== "legacy_media_unavailable")
      .length;

    const classification = classifyWhatsAppOperationalHealth({
      enabled: Boolean(settings?.whatsapp_enabled),
      connectionStatus: settings?.connection_status ?? null,
      onboardingStatus: settings?.onboarding_status ?? null,
      connectionMode: settings?.connection_mode ?? null,
      subscriptionStatus: observability?.subscription_status ?? null,
      appWebhookStatus: observability?.app_webhook_status ?? null,
      lastIngestErrorAt: observability?.last_ingest_error_at ?? null,
      lastIngestErrorKind: observability?.last_ingest_error_kind ?? null,
      lastHistoryErrorKind: observability?.last_history_error_kind ?? null,
      lastStateSyncErrorKind: observability?.last_state_sync_error_kind ?? null,
      outboundPending: safeCount(outboundPendingResult.count),
      outboundFailedRecent: safeCount(outboundFailedResult.count),
      mediaPending: safeCount(mediaPendingResult.count),
      mediaFailedRecent,
    }, now);

    return {
      ...classification,
      timezone: context.timezone ?? "UTC",
      recentFailureWindowHours: 24,
      connection: {
        enabled: Boolean(settings?.whatsapp_enabled),
        status: settings?.connection_status ?? null,
        mode: settings?.connection_mode ?? null,
        onboardingStatus: settings?.onboarding_status ?? null,
        qualityRating: settings?.quality_rating ?? null,
        connectedAt: settings?.connected_at ?? null,
        lastHealthCheckAt: settings?.last_health_check_at ?? null,
        lastErrorKind: settings?.last_connection_error_kind ?? null,
      },
      webhook: {
        subscriptionStatus: observability?.subscription_status ?? null,
        subscriptionCheckedAt: observability?.subscription_checked_at ?? null,
        appWebhookStatus: observability?.app_webhook_status ?? null,
        appWebhookCheckedAt: observability?.app_webhook_checked_at ?? null,
        appWebhookFields: Array.isArray(observability?.app_webhook_fields) ? observability.app_webhook_fields : [],
        lastMessagesWebhookAt: observability?.last_messages_webhook_at ?? null,
        lastEchoWebhookAt: observability?.last_echo_webhook_at ?? null,
        lastEchoPersistedAt: observability?.last_echo_persisted_at ?? null,
        lastIngestErrorKind: observability?.last_ingest_error_kind ?? null,
        lastIngestErrorAt: observability?.last_ingest_error_at ?? null,
      },
      sync: {
        lastHistoryWebhookAt: observability?.last_history_webhook_at ?? null,
        lastHistoryProcessedAt: observability?.last_history_processed_at ?? null,
        historyImportedCount: safeCount(observability?.last_history_imported_count ?? 0),
        historyDuplicateCount: safeCount(observability?.last_history_duplicate_count ?? 0),
        historyPhase: observability?.last_history_phase ?? null,
        historyProgress: observability?.last_history_progress ?? null,
        lastHistoryErrorKind: observability?.last_history_error_kind ?? null,
        lastStateSyncWebhookAt: observability?.last_state_sync_webhook_at ?? null,
        lastStateSyncProcessedAt: observability?.last_state_sync_processed_at ?? null,
        stateSyncAppliedCount: safeCount(observability?.last_state_sync_applied_count ?? 0),
        stateSyncIgnoredCount: safeCount(observability?.last_state_sync_ignored_count ?? 0),
        lastStateSyncErrorKind: observability?.last_state_sync_error_kind ?? null,
      },
      activity: {
        lastInboundAt: latestCanonicalTimestamp(inboundResult.data as TimestampRow[] | null),
        lastOutboundAt: latestCanonicalTimestamp(outboundResult.data as TimestampRow[] | null),
        waitingAgentCount: safeCount(waitingAgentResult.count),
      },
      queues: {
        outboundPending: safeCount(outboundPendingResult.count),
        outboundFailedRecent: safeCount(outboundFailedResult.count),
        mediaPending: safeCount(mediaPendingResult.count),
        mediaFailedRecent,
      },
    };
  }
}
