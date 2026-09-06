import type { ModuleAvailability } from "@/modules/module-access";
import type { ModuleKey } from "@/modules/module-catalog";
import type { ModuleRbacDecision } from "@/modules/module-rbac";
import {
  EXTERNAL_CAPABILITY_KEYS,
  type ExternalCapabilityKey,
  type ExternalCapabilityState,
} from "@/server/integrations/core/capabilities";

export type WorkflowConfiguration = {
  revision: string;
  lanes: readonly string[];
};

export type EffectiveCapabilityDecision = {
  capability: ExternalCapabilityKey;
  enabled: boolean;
  usable: boolean;
  health: ExternalCapabilityState["health"];
  blockers: string[];
};

export type EffectiveStoreConfiguration = {
  workflow: {
    revision: string;
    lanes: string[];
  };
  modules: Record<ModuleKey, {
    available: boolean;
    allowed: boolean;
    reason: string;
  }>;
  integrations: Record<ExternalCapabilityKey, EffectiveCapabilityDecision>;
  warnings: string[];
};

const CAPABILITY_MODULE_REQUIREMENTS: Readonly<Record<ExternalCapabilityKey, readonly ModuleKey[]>> = {
  ifood_orders: ["orders"],
  ifood_catalog: ["catalog"],
  ifood_shipping: ["orders"],
  "99food_orders": ["orders"],
  "99food_menu": ["catalog"],
  "99food_logistics": ["orders"],
  "99entrega": ["orders"],
};

const HEALTH_USABLE = new Set<ExternalCapabilityState["health"]>(["connected", "attention"]);

/**
 * Combines already-resolved module availability (plan/store/dependencies) and
 * RBAC with integration capability state. This function is deliberately pure:
 * it can explain configuration, but it never mutates modules, workflow or flags.
 *
 * Critical invariant: workflow is copied verbatim from the explicit store
 * workflow input. Modules and providers are not allowed to add/remove lanes.
 */
export function resolveEffectiveStoreConfiguration(input: {
  workflow: WorkflowConfiguration;
  moduleAvailability: Readonly<Record<ModuleKey, ModuleAvailability>>;
  moduleRbac: Readonly<Record<ModuleKey, ModuleRbacDecision>>;
  externalCapabilities: Readonly<Record<ExternalCapabilityKey, ExternalCapabilityState>>;
}): EffectiveStoreConfiguration {
  const modules = Object.fromEntries(
    (Object.keys(input.moduleAvailability) as ModuleKey[]).map((moduleKey) => {
      const availability = input.moduleAvailability[moduleKey];
      const rbac = input.moduleRbac[moduleKey];
      return [moduleKey, {
        available: availability.available,
        allowed: availability.available && rbac.allowed,
        reason: !availability.available ? availability.reason : rbac.reason,
      }];
    }),
  ) as EffectiveStoreConfiguration["modules"];

  const integrations = Object.fromEntries(
    EXTERNAL_CAPABILITY_KEYS.map((capability) => {
      const state = input.externalCapabilities[capability];
      const blockers: string[] = [];

      if (!state.enabled) blockers.push("capability_disabled");
      if (!HEALTH_USABLE.has(state.health)) blockers.push(`provider_${state.health}`);

      for (const moduleKey of CAPABILITY_MODULE_REQUIREMENTS[capability]) {
        const module = modules[moduleKey];
        if (!module.available) blockers.push(`module_${moduleKey}_${module.reason}`);
        else if (!module.allowed) blockers.push(`module_${moduleKey}_permission_denied`);
      }

      return [capability, {
        capability,
        enabled: state.enabled,
        usable: blockers.length === 0,
        health: state.health,
        blockers,
      } satisfies EffectiveCapabilityDecision];
    }),
  ) as Record<ExternalCapabilityKey, EffectiveCapabilityDecision>;

  const warnings = Object.values(integrations)
    .filter((decision) => decision.enabled && !decision.usable)
    .map((decision) => `${decision.capability}: ${decision.blockers.join(", ")}`);

  return {
    workflow: {
      revision: input.workflow.revision,
      lanes: [...input.workflow.lanes],
    },
    modules,
    integrations,
    warnings,
  };
}
