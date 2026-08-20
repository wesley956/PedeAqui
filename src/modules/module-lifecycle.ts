import {
  MODULE_CATALOG,
  MODULE_KEYS,
  profileSupportsModule,
  type BusinessType,
  type ModuleKey,
} from "@/modules/module-catalog";

export type ModuleChange = {
  moduleKey: ModuleKey;
  enabled: boolean;
  reason: "requested" | "dependency";
};

export type ModuleLifecycleBlocker = {
  code: "core_module" | "unsupported_profile" | "not_in_plan" | "active_dependent" | "operational_blocker";
  moduleKey: ModuleKey;
  relatedModuleKey?: ModuleKey;
  detail?: string;
};

export type ModuleLifecyclePlan = {
  status: "ready" | "blocked";
  requestedModuleKey: ModuleKey;
  requestedEnabled: boolean;
  changes: ModuleChange[];
  blockers: ModuleLifecycleBlocker[];
};

function dependentsOf(moduleKey: ModuleKey, enabled: ReadonlySet<ModuleKey>) {
  const dependents = new Set<ModuleKey>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of MODULE_KEYS) {
      if (!enabled.has(candidate) || candidate === moduleKey || dependents.has(candidate)) continue;
      if (MODULE_CATALOG[candidate].dependencies.some((dependency) => dependency === moduleKey || dependents.has(dependency))) {
        dependents.add(candidate);
        changed = true;
      }
    }
  }
  return MODULE_KEYS.filter((key) => dependents.has(key));
}

export function planModuleActivation(input: {
  moduleKey: ModuleKey;
  businessType: BusinessType;
  enabledModuleKeys: ReadonlySet<ModuleKey>;
  modulesBlockedByPlan?: ReadonlySet<ModuleKey>;
}): ModuleLifecyclePlan {
  const blockers: ModuleLifecycleBlocker[] = [];
  const changes = new Map<ModuleKey, ModuleChange>();
  const visiting = new Set<ModuleKey>();

  const include = (moduleKey: ModuleKey, reason: ModuleChange["reason"]) => {
    if (input.enabledModuleKeys.has(moduleKey) || changes.has(moduleKey)) return;
    if (visiting.has(moduleKey)) throw new Error(`Module dependency cycle at ${moduleKey}`);

    if (!profileSupportsModule(input.businessType, moduleKey)) {
      blockers.push({ code: "unsupported_profile", moduleKey });
      return;
    }
    if (input.modulesBlockedByPlan?.has(moduleKey)) {
      blockers.push({ code: "not_in_plan", moduleKey });
      return;
    }

    visiting.add(moduleKey);
    for (const dependency of MODULE_CATALOG[moduleKey].dependencies) include(dependency, "dependency");
    visiting.delete(moduleKey);
    changes.set(moduleKey, { moduleKey, enabled: true, reason });
  };

  include(input.moduleKey, "requested");
  return {
    status: blockers.length > 0 ? "blocked" : "ready",
    requestedModuleKey: input.moduleKey,
    requestedEnabled: true,
    changes: blockers.length > 0 ? [] : MODULE_KEYS.flatMap((key) => changes.get(key) ?? []),
    blockers,
  };
}

export function planModuleDeactivation(input: {
  moduleKey: ModuleKey;
  enabledModuleKeys: ReadonlySet<ModuleKey>;
  operationalBlockers?: readonly string[];
}): ModuleLifecyclePlan {
  const definition = MODULE_CATALOG[input.moduleKey];
  const blockers: ModuleLifecycleBlocker[] = [];

  if (!input.enabledModuleKeys.has(input.moduleKey)) {
    return { status: "ready", requestedModuleKey: input.moduleKey, requestedEnabled: false, changes: [], blockers: [] };
  }

  if (!definition.canDisable || definition.kind === "core") {
    blockers.push({ code: "core_module", moduleKey: input.moduleKey });
  }

  for (const dependent of dependentsOf(input.moduleKey, input.enabledModuleKeys)) {
    blockers.push({ code: "active_dependent", moduleKey: input.moduleKey, relatedModuleKey: dependent });
  }

  for (const detail of input.operationalBlockers ?? []) {
    blockers.push({ code: "operational_blocker", moduleKey: input.moduleKey, detail });
  }

  return {
    status: blockers.length > 0 ? "blocked" : "ready",
    requestedModuleKey: input.moduleKey,
    requestedEnabled: false,
    changes: blockers.length > 0 ? [] : [{ moduleKey: input.moduleKey, enabled: false, reason: "requested" }],
    blockers,
  };
}

export function planModuleChange(input: {
  moduleKey: ModuleKey;
  enabled: boolean;
  businessType: BusinessType;
  enabledModuleKeys: ReadonlySet<ModuleKey>;
  modulesBlockedByPlan?: ReadonlySet<ModuleKey>;
  operationalBlockers?: readonly string[];
}): ModuleLifecyclePlan {
  return input.enabled
    ? planModuleActivation(input)
    : planModuleDeactivation(input);
}
