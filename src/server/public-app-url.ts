const OFFICIAL_PUBLIC_APP_ORIGIN = "https://pedeaqui.pp.ua";
const LEGACY_TECHNICAL_HOSTS = new Set(["cruz-iota.vercel.app"]);

function validatedOrigin(value: string) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
    throw new Error("URL pública inválida.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("URL pública deve usar HTTPS em produção.");
  }
  return url;
}

/**
 * Returns the customer-facing origin used in links sent outside the app.
 * PUBLIC_APP_URL may explicitly override APP_URL. The historical Vercel host
 * is never exposed to customers and falls back to the official domain.
 */
export function resolvePublicAppOrigin(appUrl: string) {
  const override = process.env.PUBLIC_APP_URL?.trim();
  const origin = validatedOrigin(override || appUrl);
  if (LEGACY_TECHNICAL_HOSTS.has(origin.hostname.toLowerCase())) {
    return new URL(OFFICIAL_PUBLIC_APP_ORIGIN);
  }
  origin.pathname = "/";
  origin.search = "";
  origin.hash = "";
  return origin;
}

export function officialPublicAppOrigin() {
  return OFFICIAL_PUBLIC_APP_ORIGIN;
}
