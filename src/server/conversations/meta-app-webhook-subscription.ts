import type { MetaSubscriptionStatus } from "@/server/conversations/coexistence-observability-model";

export const REQUIRED_COEXISTENCE_WEBHOOK_FIELDS = ["messages", "smb_message_echoes"] as const;

export type MetaAppWebhookField = string | {
  name?: string | null;
  version?: string | null;
};

export type MetaAppWebhookSubscriptionEntry = {
  object?: string | null;
  active?: boolean | null;
  fields?: MetaAppWebhookField[] | null;
  callback_url?: string | null;
};

export type MetaAppWebhookSubscriptionsResponse = {
  data?: MetaAppWebhookSubscriptionEntry[];
};

export type MetaAppWebhookCertification = {
  status: MetaSubscriptionStatus;
  errorKind: string | null;
  fields: string[];
};

export type MetaAppWebhookRepairPlan = MetaAppWebhookCertification & {
  repairable: boolean;
  callbackUrl: string | null;
};

function normalizeFieldName(field: MetaAppWebhookField) {
  const raw = typeof field === "string" ? field : field?.name;
  return raw?.trim() ?? "";
}

function whatsappBusinessSubscription(payload: MetaAppWebhookSubscriptionsResponse) {
  return (payload.data ?? []).find(
    (entry) => entry.object === "whatsapp_business_account",
  );
}

export function certifyMetaWhatsAppWebhookSubscription(
  payload: MetaAppWebhookSubscriptionsResponse,
): MetaAppWebhookCertification {
  const subscription = whatsappBusinessSubscription(payload);

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

export function planMetaWhatsAppWebhookRepair(
  payload: MetaAppWebhookSubscriptionsResponse,
): MetaAppWebhookRepairPlan {
  const certification = certifyMetaWhatsAppWebhookSubscription(payload);
  const subscription = whatsappBusinessSubscription(payload);
  const callbackUrl = subscription?.callback_url?.trim() || null;

  if (certification.status === "subscribed") {
    return { ...certification, repairable: false, callbackUrl };
  }

  const echoOnlyMissing = certification.errorKind === "meta_webhook_field_missing_smb_message_echoes"
    && certification.fields.includes("messages");
  if (!echoOnlyMissing) {
    return { ...certification, repairable: false, callbackUrl };
  }

  if (!callbackUrl) {
    return {
      status: "action_required",
      errorKind: "meta_webhook_callback_unavailable",
      fields: certification.fields,
      repairable: false,
      callbackUrl: null,
    };
  }

  return {
    status: certification.status,
    errorKind: certification.errorKind,
    fields: [...new Set([...certification.fields, "smb_message_echoes"])].sort(),
    repairable: true,
    callbackUrl,
  };
}
