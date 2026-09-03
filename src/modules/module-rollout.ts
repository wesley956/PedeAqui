import type { ModuleAvailability } from "@/modules/module-access";
import type { ModuleKey } from "@/modules/module-catalog";

export type ModuleResolverMode = "legacy" | "shadow" | "new";

export type ModuleRolloutConfig = {
  enabled?: boolean;
  shadow?: boolean;
  rollbackToLegacy?: boolean;
  organizationIds?: readonly string[];
  storeIds?: readonly string[];
  cohorts?: readonly string[];
  percentage?: number;
};

export type ModuleRolloutContext = {
  organizationId: string;
  storeId: string;
  cohort?: string | null;
};

export type ModuleRolloutReason =
  | "disabled"
  | "rollback"
  | "store_target"
  | "organization_target"
  | "cohort_target"
  | "percentage_target"
  | "not_targeted";

export type ModuleRolloutDecision = {
  mode: ModuleResolverMode;
  selected: boolean;
  reason: ModuleRolloutReason;
};

export type ModuleRolloutDiagnostic<D> = {
  organizationId: string;
  storeId: string;
  mode: ModuleResolverMode;
  reason: ModuleRolloutReason;
  fallbackUsed: boolean;
  legacyDurationMs: number;
  nextDurationMs: number;
  divergence?: D;
};

export type ModuleResolverExecution<T, D> = {
  value: T;
  effectiveResolver: "legacy" | "new";
  rollout: ModuleRolloutDecision;
  fallbackUsed: boolean;
  divergence?: D;
};

function normalizedPercentage(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Deterministic FNV-1a bucket. The same store always lands in the same rollout bucket. */
export function moduleRolloutBucket(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function resolveModuleRollout(
  config: ModuleRolloutConfig | null | undefined,
  context: ModuleRolloutContext,
): ModuleRolloutDecision {
  if (!config?.enabled) return { mode: "legacy", selected: false, reason: "disabled" };
  if (config.rollbackToLegacy) return { mode: "legacy", selected: false, reason: "rollback" };

  let reason: ModuleRolloutReason | null = null;
  if (config.storeIds?.includes(context.storeId)) reason = "store_target";
  else if (config.organizationIds?.includes(context.organizationId)) reason = "organization_target";
  else if (context.cohort && config.cohorts?.includes(context.cohort)) reason = "cohort_target";
  else {
    const percentage = normalizedPercentage(config.percentage);
    if (percentage > 0 && moduleRolloutBucket(`${context.organizationId}:${context.storeId}`) < percentage) {
      reason = "percentage_target";
    }
  }

  if (!reason) return { mode: "legacy", selected: false, reason: "not_targeted" };
  return { mode: config.shadow ? "shadow" : "new", selected: true, reason };
}

export function compareModuleAvailabilityMaps(
  legacy: Readonly<Record<ModuleKey, ModuleAvailability>>,
  next: Readonly<Record<ModuleKey, ModuleAvailability>>,
): ModuleKey[] {
  const divergent: ModuleKey[] = [];
  for (const moduleKey of Object.keys(legacy) as ModuleKey[]) {
    const before = legacy[moduleKey];
    const after = next[moduleKey];
    if (!after || before.available !== after.available || before.reason !== after.reason) divergent.push(moduleKey);
  }
  return divergent;
}

export function executeModuleResolverRollout<T, D = unknown>(input: {
  config: ModuleRolloutConfig | null | undefined;
  context: ModuleRolloutContext;
  legacy: () => T;
  next: () => T;
  compare?: (legacy: T, next: T) => D | undefined;
  onDiagnostic?: (diagnostic: ModuleRolloutDiagnostic<D>) => void;
  now?: () => number;
}): ModuleResolverExecution<T, D> {
  const rollout = resolveModuleRollout(input.config, input.context);
  const now = input.now ?? (() => Date.now());

  if (rollout.mode === "legacy") {
    const startedAt = now();
    const value = input.legacy();
    input.onDiagnostic?.({
      ...input.context,
      mode: rollout.mode,
      reason: rollout.reason,
      fallbackUsed: false,
      legacyDurationMs: Math.max(0, now() - startedAt),
      nextDurationMs: 0,
    });
    return { value, effectiveResolver: "legacy", rollout, fallbackUsed: false };
  }

  if (rollout.mode === "shadow") {
    const legacyStartedAt = now();
    const legacyValue = input.legacy();
    const legacyDurationMs = Math.max(0, now() - legacyStartedAt);
    const nextStartedAt = now();
    let nextDurationMs = 0;
    let divergence: D | undefined;
    let fallbackUsed = false;

    try {
      const nextValue = input.next();
      nextDurationMs = Math.max(0, now() - nextStartedAt);
      divergence = input.compare?.(legacyValue, nextValue);
    } catch {
      nextDurationMs = Math.max(0, now() - nextStartedAt);
      fallbackUsed = true;
    }

    input.onDiagnostic?.({
      ...input.context,
      mode: rollout.mode,
      reason: rollout.reason,
      fallbackUsed,
      legacyDurationMs,
      nextDurationMs,
      divergence,
    });
    return { value: legacyValue, effectiveResolver: "legacy", rollout, fallbackUsed, divergence };
  }

  const nextStartedAt = now();
  try {
    const value = input.next();
    const nextDurationMs = Math.max(0, now() - nextStartedAt);
    input.onDiagnostic?.({
      ...input.context,
      mode: rollout.mode,
      reason: rollout.reason,
      fallbackUsed: false,
      legacyDurationMs: 0,
      nextDurationMs,
    });
    return { value, effectiveResolver: "new", rollout, fallbackUsed: false };
  } catch {
    const nextDurationMs = Math.max(0, now() - nextStartedAt);
    const legacyStartedAt = now();
    const value = input.legacy();
    const legacyDurationMs = Math.max(0, now() - legacyStartedAt);
    input.onDiagnostic?.({
      ...input.context,
      mode: rollout.mode,
      reason: rollout.reason,
      fallbackUsed: true,
      legacyDurationMs,
      nextDurationMs,
    });
    return { value, effectiveResolver: "legacy", rollout, fallbackUsed: true };
  }
}
