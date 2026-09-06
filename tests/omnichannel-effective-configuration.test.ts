import { describe, expect, it } from "vitest";
import type { ModuleAvailability } from "@/modules/module-access";
import { MODULE_KEYS, type ModuleKey } from "@/modules/module-catalog";
import type { ModuleRbacDecision } from "@/modules/module-rbac";
import {
  EXTERNAL_CAPABILITY_KEYS,
  externalCapabilitiesOff,
  type ExternalCapabilityKey,
  type ExternalCapabilityState,
} from "@/server/integrations/core/capabilities";
import { resolveEffectiveStoreConfiguration } from "@/server/integrations/core/effective-store-configuration";

function moduleAvailability(overrides: Partial<Record<ModuleKey, boolean>> = {}) {
  return Object.fromEntries(MODULE_KEYS.map((moduleKey) => {
    const available = overrides[moduleKey] ?? true;
    return [moduleKey, {
      moduleKey,
      available,
      reason: available ? "available" : "disabled_by_store",
      missingDependencies: [],
    } satisfies ModuleAvailability];
  })) as Record<ModuleKey, ModuleAvailability>;
}

function moduleRbac(overrides: Partial<Record<ModuleKey, boolean>> = {}) {
  return Object.fromEntries(MODULE_KEYS.map((moduleKey) => {
    const allowed = overrides[moduleKey] ?? true;
    return [moduleKey, {
      moduleKey,
      allowed,
      visible: allowed,
      reason: allowed ? "allowed" : "permission_denied",
      permissionTrace: [],
    } satisfies ModuleRbacDecision];
  })) as Record<ModuleKey, ModuleRbacDecision>;
}

function capabilitiesOn(keys: readonly ExternalCapabilityKey[]) {
  const state = externalCapabilitiesOff();
  for (const key of keys) state[key] = { enabled: true, health: "connected" };
  return state;
}

const workflow = { revision: "wf-3-cards", lanes: ["new", "preparing", "ready"] } as const;

describe("omnichannel effective store configuration invariants", () => {
  it("keeps every external capability OFF by default", () => {
    const state = externalCapabilitiesOff();
    expect(EXTERNAL_CAPABILITY_KEYS.every((key) => state[key].enabled === false)).toBe(true);
  });

  it("does not change workflow lanes when every provider capability is enabled", () => {
    const allOn = Object.fromEntries(
      EXTERNAL_CAPABILITY_KEYS.map((key) => [key, { enabled: true, health: "connected" } satisfies ExternalCapabilityState]),
    ) as Record<ExternalCapabilityKey, ExternalCapabilityState>;

    const result = resolveEffectiveStoreConfiguration({
      workflow,
      moduleAvailability: moduleAvailability(),
      moduleRbac: moduleRbac(),
      externalCapabilities: allOn,
    });

    expect(result.workflow).toEqual({ revision: "wf-3-cards", lanes: ["new", "preparing", "ready"] });
  });

  it("covers the Dona Maria regression: toggling Entregas cannot turn 3 cards into 4", () => {
    const withDeliveries = resolveEffectiveStoreConfiguration({
      workflow,
      moduleAvailability: moduleAvailability({ deliveries: true }),
      moduleRbac: moduleRbac(),
      externalCapabilities: externalCapabilitiesOff(),
    });
    const withoutDeliveries = resolveEffectiveStoreConfiguration({
      workflow,
      moduleAvailability: moduleAvailability({ deliveries: false, driver: false }),
      moduleRbac: moduleRbac(),
      externalCapabilities: externalCapabilitiesOff(),
    });

    expect(withDeliveries.workflow.lanes).toEqual(workflow.lanes);
    expect(withoutDeliveries.workflow.lanes).toEqual(workflow.lanes);
    expect(withDeliveries.workflow.lanes).toHaveLength(3);
    expect(withoutDeliveries.workflow.lanes).toHaveLength(3);
  });

  it("keeps external logistics independent from the own-deliveries module", () => {
    const result = resolveEffectiveStoreConfiguration({
      workflow,
      moduleAvailability: moduleAvailability({ deliveries: false, driver: false }),
      moduleRbac: moduleRbac(),
      externalCapabilities: capabilitiesOn(["99entrega"]),
    });

    expect(result.modules.deliveries.allowed).toBe(false);
    expect(result.integrations["99entrega"].usable).toBe(true);
    expect(result.workflow.lanes).toEqual(workflow.lanes);
  });

  it("does not treat a connected provider as an enabled capability", () => {
    const state = externalCapabilitiesOff();
    state.ifood_orders = { enabled: false, health: "connected" };
    const result = resolveEffectiveStoreConfiguration({
      workflow,
      moduleAvailability: moduleAvailability(),
      moduleRbac: moduleRbac(),
      externalCapabilities: state,
    });

    expect(result.integrations.ifood_orders.enabled).toBe(false);
    expect(result.integrations.ifood_orders.usable).toBe(false);
    expect(result.integrations.ifood_orders.blockers).toContain("capability_disabled");
  });

  it("does not let an integration bypass RBAC", () => {
    const result = resolveEffectiveStoreConfiguration({
      workflow,
      moduleAvailability: moduleAvailability(),
      moduleRbac: moduleRbac({ orders: false }),
      externalCapabilities: capabilitiesOn(["ifood_orders"]),
    });

    expect(result.integrations.ifood_orders.usable).toBe(false);
    expect(result.integrations.ifood_orders.blockers).toContain("module_orders_permission_denied");
  });
});
