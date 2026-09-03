export const OPERATIONAL_HEALTH_THRESHOLDS = {
  pendingConfirmationMs: 10 * 60_000,
  staleConfirmedOrderMs: 90 * 60_000,
  deliveryRouteMs: 90 * 60_000,
  deliveryPromiseGraceMs: 15 * 60_000,
  telemetryWindowMs: 10 * 60_000,
  checkoutFailureThreshold: 3,
} as const;

export function minutesSince(timestamp: string | null | undefined, now = Date.now()) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor((now - parsed) / 60_000));
}

export function isPendingOrderStuck(input: {
  orderStatus: string;
  createdAt: string;
  scheduledFor?: string | null;
  now?: number;
}) {
  if (input.orderStatus !== "pending_confirmation") return false;
  const now = input.now ?? Date.now();
  const scheduled = input.scheduledFor ? Date.parse(input.scheduledFor) : Number.NaN;
  if (Number.isFinite(scheduled) && scheduled > now) return false;
  return now - Date.parse(input.createdAt) >= OPERATIONAL_HEALTH_THRESHOLDS.pendingConfirmationMs;
}

export function isConfirmedOrderStale(input: {
  orderStatus: string;
  updatedAt: string;
  now?: number;
}) {
  if (["completed", "canceled"].includes(input.orderStatus)) return false;
  if (input.orderStatus !== "confirmed") return false;
  const now = input.now ?? Date.now();
  return now - Date.parse(input.updatedAt) >= OPERATIONAL_HEALTH_THRESHOLDS.staleConfirmedOrderMs;
}

export function isDeliveryRouteLate(input: {
  outForDeliveryAt?: string | null;
  deliveredAt?: string | null;
  canceledAt?: string | null;
  promisedByAt?: string | null;
  now?: number;
}) {
  if (!input.outForDeliveryAt || input.deliveredAt || input.canceledAt) return false;
  const now = input.now ?? Date.now();
  const startedAt = Date.parse(input.outForDeliveryAt);
  if (!Number.isFinite(startedAt)) return false;
  const absoluteLate = now - startedAt >= OPERATIONAL_HEALTH_THRESHOLDS.deliveryRouteMs;
  const promisedAt = input.promisedByAt ? Date.parse(input.promisedByAt) : Number.NaN;
  const promisedLate = Number.isFinite(promisedAt)
    && now - promisedAt >= OPERATIONAL_HEALTH_THRESHOLDS.deliveryPromiseGraceMs;
  return absoluteLate || promisedLate;
}

export type ExperienceSignal = {
  event_name: string;
  outcome: string | null;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
};

export function hasUnrecoveredRealtimeFailure(events: readonly ExperienceSignal[]) {
  const ordered = events
    .filter((event) => event.event_name === "px.realtime.connection")
    .slice()
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
  const latest = ordered[0];
  return latest?.outcome === "failure";
}

export function checkoutFailureBurst(events: readonly ExperienceSignal[]) {
  return events.filter((event) => event.event_name === "px.checkout.step" && event.outcome === "failure").length;
}
