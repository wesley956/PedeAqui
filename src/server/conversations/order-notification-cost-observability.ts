export type OrderNotificationOutcomeStatus = "sent" | "failed" | "skipped";
export type OrderNotificationDispatchMode = "freeform" | "template" | "existing" | null;

export type OrderNotificationOperationalCounters = {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  sent_freeform: number;
  sent_template: number;
  sent_existing: number;
  suppressed: number;
  [key: `suppressed_${string}`]: number;
};

export function createOrderNotificationOperationalCounters(): OrderNotificationOperationalCounters {
  return {
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    sent_freeform: 0,
    sent_template: 0,
    sent_existing: 0,
    suppressed: 0,
  };
}

function normalizeReasonCode(reasonCode: string | null | undefined) {
  const normalized = String(reasonCode ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "unknown";
}

export function recordOrderNotificationOperationalOutcome(
  counters: OrderNotificationOperationalCounters,
  input: {
    status: OrderNotificationOutcomeStatus;
    dispatchMode?: OrderNotificationDispatchMode;
    reasonCode?: string | null;
  },
) {
  counters[input.status] += 1;

  if (input.status === "sent") {
    if (input.dispatchMode === "freeform") counters.sent_freeform += 1;
    if (input.dispatchMode === "template") counters.sent_template += 1;
    if (input.dispatchMode === "existing") counters.sent_existing += 1;
    return counters;
  }

  if (input.status === "skipped") {
    counters.suppressed += 1;
    const key = `suppressed_${normalizeReasonCode(input.reasonCode)}` as const;
    counters[key] = (counters[key] ?? 0) + 1;
  }

  return counters;
}
