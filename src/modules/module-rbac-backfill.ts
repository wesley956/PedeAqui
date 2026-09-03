import type { ModuleKey } from "@/modules/module-catalog";
import type { ModulePermissionEffect, ModulePermissionGrant, ModulePermissionScope } from "@/modules/module-rbac";

export type LegacyModulePermissionAssignment = {
  moduleKey: ModuleKey;
  permission: string;
  organizationId: string;
  storeId?: string | null;
  allowed: boolean | null | undefined;
  sourceId: string;
};

export type ModuleRbacBackfillRecord = ModulePermissionGrant & {
  moduleKey: ModuleKey;
  sourceIds: string[];
};

export type ModuleRbacBackfillPlan = {
  grants: ModuleRbacBackfillRecord[];
  skippedSourceIds: string[];
  rollbackSourceIds: string[];
};

function assignmentScope(assignment: LegacyModulePermissionAssignment): ModulePermissionScope {
  return assignment.storeId ? "store" : "organization";
}

function stableKey(assignment: LegacyModulePermissionAssignment): string {
  return [assignment.moduleKey, assignment.permission, assignment.organizationId, assignment.storeId ?? "", assignmentScope(assignment)].join("|");
}

function effectForAssignment(assignment: LegacyModulePermissionAssignment): ModulePermissionEffect | null {
  if (assignment.allowed === true) return "allow";
  if (assignment.allowed === false) return "deny";
  return null;
}

/** Pure dry-run: unknown legacy state is skipped and conflicts at the same exact scope collapse to deny. */
export function planModuleRbacBackfill(assignments: readonly LegacyModulePermissionAssignment[]): ModuleRbacBackfillPlan {
  const grouped = new Map<string, LegacyModulePermissionAssignment[]>();
  const skippedSourceIds: string[] = [];

  for (const assignment of assignments) {
    if (effectForAssignment(assignment) == null) {
      skippedSourceIds.push(assignment.sourceId);
      continue;
    }
    const key = stableKey(assignment);
    const existing = grouped.get(key) ?? [];
    existing.push(assignment);
    grouped.set(key, existing);
  }

  const grants = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]): ModuleRbacBackfillRecord => {
      const exemplar = group[0];
      if (!exemplar) throw new Error("RBAC backfill invariant violated: empty assignment group");
      const effects = group.map(effectForAssignment).filter((effect): effect is ModulePermissionEffect => effect != null);
      const effect: ModulePermissionEffect = effects.includes("deny") ? "deny" : "allow";
      const sourceIds = group.map((entry) => entry.sourceId).sort();
      return {
        moduleKey: exemplar.moduleKey,
        permission: exemplar.permission,
        effect,
        scope: assignmentScope(exemplar),
        organizationId: exemplar.organizationId,
        storeId: exemplar.storeId ?? null,
        sourceId: sourceIds.join(","),
        sourceIds,
      };
    });

  return {
    grants,
    skippedSourceIds: skippedSourceIds.sort(),
    rollbackSourceIds: grants.flatMap((grant) => grant.sourceIds).sort(),
  };
}
