import { officialPublicAppOrigin } from "@/server/public-app-url";

/** Use configured public origins, never the Docker listener or untrusted Host headers. */
export function mercadoPagoOAuthAppUrl(path: string) {
  const candidates = [
    process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    officialPublicAppOrigin(),
  ];
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      const url = new URL(candidate.trim());
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
      if (["0.0.0.0", "[::]"].includes(url.hostname)) continue;
      if (process.env.NODE_ENV === "production"
        && (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) continue;
      return new URL(path, url.origin);
    } catch { /* Try the next configured public origin. */ }
  }
  return new URL(path, officialPublicAppOrigin());
}
