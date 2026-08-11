export type PrintHealth = "unknown" | "online" | "offline" | "degraded";

export function effectivePrintHealth(status: PrintHealth, lastSeenAt: string | null, now = Date.now()): PrintHealth {
  if (!lastSeenAt) return status === "online" ? "unknown" : status;
  const lastSeen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeen)) return "unknown";
  if (now - lastSeen > 60_000) return "offline";
  return status;
}
