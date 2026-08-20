import "server-only";

import { cache } from "react";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import { contextsForRoleKeys, contextualNavigation } from "@/components/layout/navigation-model";
import { PermissionSnapshotService } from "@/server/access/permission-snapshot-service";

export type NavigationAccess = {
  context: AccessContext;
  roleKeys: string[];
  operationalContexts: ReturnType<typeof contextsForRoleKeys>;
  permissionKeys: string[];
  items: ReturnType<typeof contextualNavigation>;
};

const loadNavigationAccess = cache(async (): Promise<NavigationAccess> => {
  const context = await getAccessContext();
  const { roleKeys, permissionKeys } = await PermissionSnapshotService.load(context);
  const operationalContexts = contextsForRoleKeys(roleKeys);
  const items = contextualNavigation(operationalContexts, new Set(permissionKeys), false);

  return { context, roleKeys, operationalContexts, permissionKeys, items };
});

export class NavigationAccessService {
  static async load(): Promise<NavigationAccess> {
    return loadNavigationAccess();
  }
}
