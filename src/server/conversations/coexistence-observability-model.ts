export const META_SUBSCRIPTION_STATUSES = [
  "unknown",
  "supported",
  "not_supported",
  "not_subscribed",
  "subscribed",
  "action_required",
] as const;

export type MetaSubscriptionStatus = (typeof META_SUBSCRIPTION_STATUSES)[number];
export type ObservableWhatsAppEventKind = "message" | "echo" | "sync" | "status";

export function summarizeWebhookReceiptKinds(kinds: readonly ObservableWhatsAppEventKind[]) {
  return {
    messages: kinds.includes("message"),
    echo: kinds.includes("echo"),
  };
}

export function subscriptionNeedsAction(status: MetaSubscriptionStatus) {
  return status === "not_subscribed" || status === "action_required";
}
