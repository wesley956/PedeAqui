import { describe, expect, it } from "vitest";
import {
  canExistingCustomerPersonalizeModules,
  isModuleFeatureAuthoritative,
  resolveModuleFeatureGate,
  type ModuleFeatureGateConfig,
} from "@/modules/module-feature-gates";

const context = { organizationId: "org-a", storeId: "store-a" };
const config: ModuleFeatureGateConfig = {
  rollout: { enabled: true, storeIds: ["store-a"] },
  gates: {
    configuration_read: true,
    module_edit: false,
    profile_onboarding: false,
    easy_mode: false,
    gas_profile: false,
  },
};

describe("modular migration feature gates", () => {
  it("keeps every feature independent", () => {
    expect(resolveModuleFeatureGate(config, context, "configuration_read")).toBe("enabled");
    expect(resolveModuleFeatureGate(config, context, "module_edit")).toBe("disabled");
    expect(resolveModuleFeatureGate(config, context, "profile_onboarding")).toBe("disabled");
    expect(resolveModuleFeatureGate(config, context, "easy_mode")).toBe("disabled");
    expect(resolveModuleFeatureGate(config, context, "gas_profile")).toBe("disabled");
  });

  it("makes shadow observation-only even when a feature gate is on", () => {
    const shadow: ModuleFeatureGateConfig = {
      rollout: { enabled: true, shadow: true, storeIds: ["store-a"] },
      gates: { module_edit: true },
    };
    expect(resolveModuleFeatureGate(shadow, context, "module_edit")).toBe("shadow");
    expect(isModuleFeatureAuthoritative(shadow, context, "module_edit")).toBe(false);
  });

  it("lets the kill switch disable all feature gates", () => {
    const rollback: ModuleFeatureGateConfig = {
      rollout: { enabled: true, rollbackToLegacy: true, storeIds: ["store-a"] },
      gates: { configuration_read: true, module_edit: true, profile_onboarding: true, easy_mode: true, gas_profile: true },
    };
    expect(isModuleFeatureAuthoritative(rollback, context, "configuration_read")).toBe(false);
    expect(isModuleFeatureAuthoritative(rollback, context, "gas_profile")).toBe(false);
  });

  it("keeps personalization for existing customers opt-in and owner/admin only", () => {
    const editEnabled: ModuleFeatureGateConfig = {
      rollout: { enabled: true, storeIds: ["store-a"] },
      gates: { module_edit: true },
    };
    expect(canExistingCustomerPersonalizeModules({ config: editEnabled, context, roleKey: "owner", optedIn: false })).toBe(false);
    expect(canExistingCustomerPersonalizeModules({ config: editEnabled, context, roleKey: "cashier", optedIn: true })).toBe(false);
    expect(canExistingCustomerPersonalizeModules({ config: editEnabled, context, roleKey: "owner", optedIn: true })).toBe(true);
  });
});
