import { describe, expect, it } from "vitest";
import { moduleKeyFromEntitlementFeatureKey } from "@/modules/entitlement-key";
import { modulesForPreset } from "@/modules/module-catalog";

describe("commercial plan module entitlement bridge", () => {
  it("maps database module feature keys to operational module keys", () => {
    expect(moduleKeyFromEntitlementFeatureKey("module.orders")).toBe("orders");
    expect(moduleKeyFromEntitlementFeatureKey("module.catalog")).toBe("catalog");
    expect(moduleKeyFromEntitlementFeatureKey("module.deliveries")).toBe("deliveries");
    expect(moduleKeyFromEntitlementFeatureKey("module.driver")).toBe("driver");
    expect(moduleKeyFromEntitlementFeatureKey("module.gas_containers")).toBe("gas_containers");
  });

  it("ignores non-module commercial features instead of activating arbitrary resources", () => {
    expect(moduleKeyFromEntitlementFeatureKey("domains.custom")).toBeNull();
    expect(moduleKeyFromEntitlementFeatureKey("integrations.marketplace")).toBeNull();
    expect(moduleKeyFromEntitlementFeatureKey(null)).toBeNull();
  });

  it("keeps core modules and dependencies when plan modules are applied", () => {
    const modules = modulesForPreset("restaurant", "custom", ["production", "deliveries", "driver", "conversations"]);
    expect(modules).toEqual(expect.arrayContaining([
      "dashboard",
      "orders",
      "catalog",
      "customers",
      "settings",
      "production",
      "deliveries",
      "driver",
      "conversations",
    ]));
  });
});
