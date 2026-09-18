const OFFICIAL_PUBLIC_APP_ORIGIN = "https://pedeaqui.pp.ua";
const TECHNICAL_HOST_SUFFIX = ".vercel.app";

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

function isTechnicalDeploymentHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "vercel.app" || normalized.endsWith(TECHNICAL_HOST_SUFFIX);
}

/**
 * Returns the customer-facing origin used in links sent outside the app.
 * PUBLIC_APP_URL may explicitly override APP_URL. Technical deployment hosts
 * are never exposed to customers and fall back to the official domain.
 */
export function resolvePublicAppOrigin(appUrl: string) {
  const override = process.env.PUBLIC_APP_URL?.trim();
  const origin = validatedOrigin(override || appUrl);
  if (isTechnicalDeploymentHost(origin.hostname)) {
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
