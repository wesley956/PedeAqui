import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/server/access/permissions";
import { contextualNavigation, type OperationalContext } from "@/components/layout/navigation-model";
import { selectMobileNavigation } from "@/components/layout/mobile-navigation";
import { resolveOperationalStartRoute } from "@/components/layout/start-route";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const allPermissions = new Set<string>(Object.values(PERMISSIONS));

const journeys: Array<{ name: string; context: OperationalContext; permissions: Set<string>; start: string; required: string[] }> = [
  { name: "gestão", context: "management", permissions: allPermissions, start: "/dashboard", required: ["dashboard", "orders", "cash", "finance"] },
  { name: "caixa", context: "cashier", permissions: new Set([PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_CREATE, PERMISSIONS.CASH_OPEN, PERMISSIONS.CUSTOMERS_VIEW]), start: "/pdv", required: ["pdv", "cash", "orders"] },
  { name: "salão", context: "floor", permissions: new Set([PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_CREATE, PERMISSIONS.ORDERS_EDIT, PERMISSIONS.CUSTOMERS_VIEW]), start: "/salao", required: ["dining", "orders"] },
  { name: "cozinha", context: "kitchen", permissions: new Set([PERMISSIONS.ORDERS_VIEW, PERMISSIONS.ORDERS_EDIT]), start: "/producao", required: ["production", "orders"] },
  { name: "entrega", context: "delivery", permissions: new Set([PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.DELIVERY_UPDATE, PERMISSIONS.ORDERS_VIEW]), start: "/entregador", required: ["driver"] },
];

describe("navigation journeys [277]", () => {
  for (const journey of journeys) {
    it(`${journey.name}: entry, desktop and mobile remain mutually reachable`, () => {
      const navigation = contextualNavigation([journey.context], journey.permissions);
      const keys = navigation.map((item) => item.key);
      for (const key of journey.required) expect(keys, `${journey.name}:${key}`).toContain(key);
      expect(resolveOperationalStartRoute([journey.context], navigation)).toBe(journey.start);

      const mobile = selectMobileNavigation(navigation, [journey.context]);
      expect(mobile.selected.length).toBeLessThanOrEqual(4);
      const mobileKeys = [...mobile.selected, ...mobile.more].map((item) => item.key).sort();
      expect(mobileKeys).toEqual([...keys].sort());
      expect([...mobile.selected, ...mobile.more].some((item) => item.href === journey.start)).toBe(true);
    });
  }

  it("management exposes secondary modules through More instead of losing them", () => {
    const navigation = contextualNavigation(["management"], allPermissions);
    const mobile = selectMobileNavigation(navigation, ["management"]);
    expect(mobile.selected.map((item) => item.key)).toEqual(["dashboard", "orders", "cash", "finance"]);
    expect(mobile.more.length).toBeGreaterThan(0);
    expect([...mobile.selected, ...mobile.more]).toHaveLength(navigation.length);
  });

  it("a user with no granted surface lands on the explicit no-access page", () => {
    const navigation = contextualNavigation(["cashier"], new Set());
    expect(navigation).toEqual([]);
    expect(resolveOperationalStartRoute(["cashier"], navigation)).toBe("/acesso-negado");
    expect(read("src/app/(app)/acesso-negado/page.tsx")).toContain("Acesso não configurado");
  });

  it("the protected app group still requires authentication", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("requireAuthenticatedUser()");
  });

  it("login preserves a safe deep link and generic login uses the contextual start", () => {
    const actions = read("src/features/auth/actions.ts");
    const safeReturnPath = read("src/lib/auth/safe-return-path.ts");
    expect(actions).toContain("redirect(returnPath ?? await StartRouteService.resolve())");
    expect(actions).toContain("safeInternalPath");
    expect(safeReturnPath).toContain('!value.startsWith("/") || value.startsWith("//")');
  });

  it("logout always returns to the public login surface", () => {
    const actions = read("src/features/auth/actions.ts");
    expect(actions).toContain("await supabase.auth.signOut()");
    expect(actions).toContain('redirect("/login")');
  });

  it("start routes cannot create a root redirect loop", () => {
    for (const journey of journeys) {
      const navigation = contextualNavigation([journey.context], journey.permissions);
      expect(resolveOperationalStartRoute([journey.context], navigation)).not.toBe("/");
    }
  });
});
