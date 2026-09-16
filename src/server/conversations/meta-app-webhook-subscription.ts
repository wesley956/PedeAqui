import type { MetaSubscriptionStatus } from "@/server/conversations/coexistence-observability-model";

export const REQUIRED_COEXISTENCE_WEBHOOK_FIELDS = ["messages", "smb_message_echoes"] as const;

export type MetaAppWebhookField = string | {
  name?: string | null;
  version?: string | null;
};

export type MetaAppWebhookSubscriptionsResponse = {
  data?: Array<{
    object?: string | null;
    active?: boolean | null;
    fields?: MetaAppWebhookField[] | null;
  }>;
};

export type MetaAppWebhookCertification = {
  status: MetaSubscriptionStatus;
  errorKind: string | null;
  fields: string[];
};

function normalizeFieldName(field: MetaAppWebhookField) {
  const raw = typeof field === "string" ? field : field?.name;
  return raw?.trim() ?? "";
}

export function certifyMetaWhatsAppWebhookSubscription(
  payload: MetaAppWebhookSubscriptionsResponse,
): MetaAppWebhookCertification {
  const subscription = (payload.data ?? []).find(
    (entry) => entry.object === "whatsapp_business_account",
  );

  if (!subscription) {
    return {
      status: "not_subscribed",
      errorKind: "meta_webhook_object_not_subscribed",
      fields: [],
    };
  }

  if (subscription.active === false) {
    return {
      status: "action_required",
      errorKind: "meta_webhook_subscription_inactive",
      fields: [],
    };
  }

  if (!Array.isArray(subscription.fields)) {
    return {
      status: "action_required",
      errorKind: "meta_webhook_fields_unavailable",
      fields: [],
    };
  }

  const fields = [...new Set(subscription.fields.map(normalizeFieldName).filter(Boolean))].sort();
  const missing = REQUIRED_COEXISTENCE_WEBHOOK_FIELDS.filter((field) => !fields.includes(field));

  if (missing.length > 0) {
    return {
      status: "not_subscribed",
      errorKind: `meta_webhook_field_missing_${missing.join("_")}`.slice(0, 120),
      fields,
    };
  }

  return { status: "subscribed", errorKind: null, fields };
}
