import { MODULE_CATALOG, MODULE_KEYS, type ModuleKey } from "@/modules/module-catalog";

function matchesRoute(pathname: string, route: string) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const normalizedRoute = route.length > 1 ? route.replace(/\/+$/, "") : route;
  return normalizedPath === normalizedRoute || normalizedPath.startsWith(`${normalizedRoute}/`);
}

/**
 * Resolves an authenticated pathname to the owning module. The longest route wins,
 * so /configuracoes/conversas belongs to conversations instead of the settings shell.
 */
export function moduleKeyForPathname(pathname: string): ModuleKey | null {
  let best: { key: ModuleKey; routeLength: number } | null = null;

  for (const key of MODULE_KEYS) {
    for (const route of MODULE_CATALOG[key].routes) {
      if (!matchesRoute(pathname, route)) continue;
      if (!best || route.length > best.routeLength) best = { key, routeLength: route.length };
    }
  }

  return best?.key ?? null;
}
