export const WHATSAPP_OPERATIONAL_HEALTH_STATES = [
  "healthy",
  "attention",
  "action_required",
  "provider_unavailable",
  "disconnected",
] as const;

export type WhatsAppOperationalHealthState = (typeof WHATSAPP_OPERATIONAL_HEALTH_STATES)[number];

export const WHATSAPP_OPERATIONAL_ISSUE_CODES = [
  "connection_action_required",
  "connection_status_unknown",
  "waba_subscription_not_confirmed",
  "app_webhook_not_confirmed",
  "ingest_failure_recent",
  "outbound_pending",
  "outbound_failed_recent",
  "media_processing_backlog",
  "media_failed_recent",
  "history_sync_error",
  "state_sync_error",
] as const;

export type WhatsAppOperationalIssueCode = (typeof WHATSAPP_OPERATIONAL_ISSUE_CODES)[number];

export type WhatsAppOperationalHealthClassificationInput = {
  enabled: boolean;
  connectionStatus: string | null;
  onboardingStatus: string | null;
  connectionMode: string | null;
  subscriptionStatus: string | null;
  appWebhookStatus: string | null;
  lastIngestErrorAt: string | null;
  lastIngestErrorKind: string | null;
  lastHistoryErrorKind: string | null;
  lastStateSyncErrorKind: string | null;
  outboundPending: number;
  outboundFailedRecent: number;
  mediaPending: number;
  mediaFailedRecent: number;
};

export type WhatsAppOperationalHealthClassification = {
  state: WhatsAppOperationalHealthState;
  issues: WhatsAppOperationalIssueCode[];
};

export const WHATSAPP_OPERATIONAL_RECENT_FAILURE_MS = 24 * 60 * 60 * 1000;

function recent(value: string | null, now: Date) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= 0 && age <= WHATSAPP_OPERATIONAL_RECENT_FAILURE_MS;
}

function needsSubscriptionAction(status: string | null) {
  return status === "not_subscribed" || status === "action_required";
}

function subscriptionUnconfirmed(status: string | null) {
  return status !== "subscribed";
}

export function classifyWhatsAppOperationalHealth(
  input: WhatsAppOperationalHealthClassificationInput,
  now = new Date(),
): WhatsAppOperationalHealthClassification {
  if (!input.enabled || input.connectionStatus === "disconnected" || input.connectionStatus === "not_connected") {
    return { state: "disconnected", issues: [] };
  }

  const issues: WhatsAppOperationalIssueCode[] = [];
  const connectionActionRequired =
    input.connectionStatus === "action_required"
    || input.onboardingStatus === "failed"
    || input.connectionStatus === "invalid_credentials";

  if (connectionActionRequired) issues.push("connection_action_required");

  const coexistence = input.connectionMode === "coexistence";
  if (coexistence && subscriptionUnconfirmed(input.subscriptionStatus)) {
    issues.push("waba_subscription_not_confirmed");
  }
  if (coexistence && subscriptionUnconfirmed(input.appWebhookStatus)) {
    issues.push("app_webhook_not_confirmed");
  }

  if (recent(input.lastIngestErrorAt, now) && input.lastIngestErrorKind) {
    issues.push("ingest_failure_recent");
  }
  if (input.outboundPending > 0) issues.push("outbound_pending");
  if (input.outboundFailedRecent > 0) issues.push("outbound_failed_recent");
  if (input.mediaPending > 0) issues.push("media_processing_backlog");
  if (input.mediaFailedRecent > 0) issues.push("media_failed_recent");
  if (input.lastHistoryErrorKind) issues.push("history_sync_error");
  if (input.lastStateSyncErrorKind) issues.push("state_sync_error");

  if (input.connectionStatus === "temporarily_unavailable") {
    return { state: "provider_unavailable", issues };
  }

  if (connectionActionRequired
    || (coexistence && needsSubscriptionAction(input.subscriptionStatus))
    || (coexistence && needsSubscriptionAction(input.appWebhookStatus))) {
    return { state: "action_required", issues };
  }

  if (input.connectionStatus !== "connected") {
    if (!issues.includes("connection_status_unknown")) issues.unshift("connection_status_unknown");
    return { state: "attention", issues };
  }

  return issues.length > 0
    ? { state: "attention", issues }
    : { state: "healthy", issues: [] };
}
