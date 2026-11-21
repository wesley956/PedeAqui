const ACTIVE_STATES = new Set(["starting", "awaiting_meta", "authorizing", "configuring_assets", "subscribing_webhooks", "registering_phone", "health_checking"]);

export function effectiveMetaSignupStatus(
  session: { status: string; expires_at: string } | null,
  now = Date.now(),
): string {
  if (!session) return "not_started";
  if (!ACTIVE_STATES.has(session.status)) return session.status;
  const expiresAt = Date.parse(session.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now ? session.status : "expired";
}
