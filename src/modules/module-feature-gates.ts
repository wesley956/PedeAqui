import {
  resolveModuleRollout,
  type ModuleRolloutConfig,
  type ModuleRolloutContext,
} from "@/modules/module-rollout";

export const MODULE_FEATURE_GATES = [
  "configuration_read",
  "module_edit",
  "profile_onboarding",
  "easy_mode",
  "gas_profile",
] as const;

export type ModuleFeatureGate = (typeof MODULE_FEATURE_GATES)[number];
export type ModuleFeatureGateState = "disabled" | "shadow" | "enabled";

export type ModuleFeatureGateConfig = {
  rollout: ModuleRolloutConfig | null | undefined;
  gates?: Readonly<Partial<Record<ModuleFeatureGate, boolean>>>;
};

export function resolveModuleFeatureGate(
  config: ModuleFeatureGateConfig,
  context: ModuleRolloutContext,
  gate: ModuleFeatureGate,
): ModuleFeatureGateState {
  if (config.gates?.[gate] !== true) return "disabled";
  const rollout = resolveModuleRollout(config.rollout, context);
  if (!rollout.selected || rollout.mode === "legacy") return "disabled";
  return rollout.mode === "shadow" ? "shadow" : "enabled";
}

/** Only `enabled` may alter authoritative behavior. Shadow is observation-only. */
export function isModuleFeatureAuthoritative(
  config: ModuleFeatureGateConfig,
  context: ModuleRolloutContext,
  gate: ModuleFeatureGate,
): boolean {
  return resolveModuleFeatureGate(config, context, gate) === "enabled";
}

export function canExistingCustomerPersonalizeModules(input: {
  config: ModuleFeatureGateConfig;
  context: ModuleRolloutContext;
  roleKey: string;
  optedIn: boolean;
}): boolean {
  if (!input.optedIn) return false;
  if (input.roleKey !== "owner" && input.roleKey !== "admin") return false;
  return isModuleFeatureAuthoritative(input.config, input.context, "module_edit");
}
