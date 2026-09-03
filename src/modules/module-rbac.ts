import type { ModuleAvailability } from "@/modules/module-access";
import { MODULE_CATALOG, type ModuleKey } from "@/modules/module-catalog";

export type ModulePermissionScope = "global" | "organization" | "store";
export type ModulePermissionEffect = "allow" | "deny";

export type ModulePermissionGrant = {
  permission: string;
  effect: ModulePermissionEffect;
  scope: ModulePermissionScope;
  organizationId?: string | null;
  storeId?: string | null;
  sourceId?: string | null;
};

export type ModuleRbacContext = {
  organizationId: string;
  storeId: string;
};

export type ModulePermissionTrace = {
  permission: string;
  effect: ModulePermissionEffect | "missing";
  scope: ModulePermissionScope | null;
  sourceId: string | null;
};

export type ModuleRbacDecision = {
  moduleKey: ModuleKey;
  allowed: boolean;
  visible: boolean;
  reason: "module_unavailable" | "permission_denied" | "allowed";
  permissionTrace: ModulePermissionTrace[];
};

const SCOPE_SPECIFICITY: Record<ModulePermissionScope, number> = {
  global: 0,
  organization: 1,
  store: 2,
};

function grantMatchesContext(grant: ModulePermissionGrant, context: ModuleRbacContext): boolean {
  if (grant.scope === "global") return true;
  if (grant.scope === "organization") return grant.organizationId === context.organizationId;
  return grant.organizationId === context.organizationId && grant.storeId === context.storeId;
}

function resolvePermission(
  permission: string,
  grants: readonly ModulePermissionGrant[],
  context: ModuleRbacContext,
): ModulePermissionTrace {
  const matching = grants
    .filter((grant) => grant.permission === permission && grantMatchesContext(grant, context))
    .sort((left, right) => {
      const specificity = SCOPE_SPECIFICITY[right.scope] - SCOPE_SPECIFICITY[left.scope];
      if (specificity !== 0) return specificity;
      if (left.effect !== right.effect) return left.effect === "deny" ? -1 : 1;
      return (left.sourceId ?? "").localeCompare(right.sourceId ?? "");
    });

  if (matching.length === 0) {
    return { permission, effect: "missing", scope: null, sourceId: null };
  }

  const highestSpecificity = SCOPE_SPECIFICITY[matching[0].scope];
  const contenders = matching.filter((grant) => SCOPE_SPECIFICITY[grant.scope] === highestSpecificity);
  const winner = contenders.find((grant) => grant.effect === "deny") ?? contenders[0];

  return {
    permission,
    effect: winner.effect,
    scope: winner.scope,
    sourceId: winner.sourceId ?? null,
  };
}

export function resolveModuleRbac(input: {
  moduleKey: ModuleKey;
  availability: ModuleAvailability;
  grants: readonly ModulePermissionGrant[];
  context: ModuleRbacContext;
}): ModuleRbacDecision {
  if (!input.availability.available) {
    return {
      moduleKey: input.moduleKey,
      allowed: false,
      visible: false,
      reason: "module_unavailable",
      permissionTrace: [],
    };
  }

  const requiredPermissions = MODULE_CATALOG[input.moduleKey].permissionsAny;
  if (requiredPermissions.length === 0) {
    return {
      moduleKey: input.moduleKey,
      allowed: true,
      visible: true,
      reason: "allowed",
      permissionTrace: [],
    };
  }

  const permissionTrace = requiredPermissions.map((permission) =>
    resolvePermission(permission, input.grants, input.context),
  );
  const allowed = permissionTrace.some((trace) => trace.effect === "allow");

  return {
    moduleKey: input.moduleKey,
    allowed,
    visible: allowed,
    reason: allowed ? "allowed" : "permission_denied",
    permissionTrace,
  };
}

export function resolveAllModuleRbac(input: {
  availabilityByModule: Readonly<Record<ModuleKey, ModuleAvailability>>;
  grants: readonly ModulePermissionGrant[];
  context: ModuleRbacContext;
}): Record<ModuleKey, ModuleRbacDecision> {
  return Object.fromEntries(
    (Object.keys(input.availabilityByModule) as ModuleKey[]).map((moduleKey) => [
      moduleKey,
      resolveModuleRbac({
        moduleKey,
        availability: input.availabilityByModule[moduleKey],
        grants: input.grants,
        context: input.context,
      }),
    ]),
  ) as Record<ModuleKey, ModuleRbacDecision>;
}

/** Navigation and server route guards intentionally consume the exact same decision. */
export function canNavigateToModule(decision: ModuleRbacDecision): boolean {
  return decision.allowed && decision.visible;
}

export function canAccessModuleRoute(decision: ModuleRbacDecision): boolean {
  return decision.allowed;
}
