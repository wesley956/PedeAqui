export type RecentOrderAccess = { orderId: string; accessToken: string };
const MAX_RECENT_ORDERS = 5;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = /^[a-zA-Z0-9_-]{32,128}$/;

export function recentOrdersCookieName(slug: string) {
  return `pa_recent_orders_${slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40)}`;
}

export function readRecentOrders(value: string | null | undefined): RecentOrderAccess[] {
  if (!value || value.length > 2048 || !/^[a-zA-Z0-9_-]+$/.test(value)) return [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((entry): entry is RecentOrderAccess => {
      if (!entry || typeof entry !== "object" || typeof entry.orderId !== "string" || typeof entry.accessToken !== "string") return false;
      if (!uuid.test(entry.orderId) || !token.test(entry.accessToken) || seen.has(entry.orderId)) return false;
      seen.add(entry.orderId);
      return true;
    }).slice(0, MAX_RECENT_ORDERS).map(({ orderId, accessToken }) => ({ orderId, accessToken }));
  } catch { return []; }
}

export function rememberRecentOrder(previous: string | null | undefined, entry: RecentOrderAccess) {
  if (!uuid.test(entry.orderId) || !token.test(entry.accessToken)) throw new Error("Invalid recent order access");
  return Buffer.from(JSON.stringify([entry, ...readRecentOrders(previous).filter((item) => item.orderId !== entry.orderId)].slice(0, MAX_RECENT_ORDERS))).toString("base64url");
}

export function recentOrdersCookieOptions(slug: string) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: `/m/${slug}`, maxAge: 30 * 24 * 60 * 60 };
}
