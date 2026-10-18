import "server-only";

import { cache } from "react";
import { getAccessContext, type AccessContext } from "@/server/access/context";
import { contextsForRoleKeys, contextualNavigation, sanitizeNavigationPins, type NavigationGroup, type NavigationPriority } from "@/components/layout/navigation-model";
import { isModuleKey, moduleLabel, type BusinessType } from "@/modules/module-catalog";
import { selectEasyModuleKeys, type ExperienceMode } from "@/modules/user-experience";
import { ModuleAccessService, type StoreModuleSnapshot } from "@/server/modules/module-access-service";
import { NavigationPreferenceService } from "@/server/preferences/navigation-preference-service";
import { UserExperienceService } from "@/server/preferences/user-experience-service";

export type NavigationAccessItem = {
  key: string;
  label: string;
  href: string;
  group: NavigationGroup;
  priority: NavigationPriority;
  permissions: readonly string[];
  authorization: "organization" | "platform";
  easyPrimary: boolean;
  /** Posição escolhida pelo usuário no grupo "Principal"; null quando o item não foi fixado. */
  pinnedOrder: number | null;
};

export type NavigationAccess = {
  context: AccessContext;
  roleKeys: string[];
  operationalContexts: ReturnType<typeof contextsForRoleKeys>;
  permissionKeys: string[];
  businessType: BusinessType;
  experienceMode: ExperienceMode;
  moduleAvailability: StoreModuleSnapshot["availability"];
  items: NavigationAccessItem[];
  /** true quando o usuário personalizou o menu (há itens fixados válidos). */
  customNavigation: boolean;
};

const loadNavigationAccess = cache(async (): Promise<NavigationAccess> => {
  const context = await getAccessContext();
  const [moduleSnapshot, experienceMode, storedPins] = await Promise.all([
    ModuleAccessService.load(context),
    UserExperienceService.load(context),
    NavigationPreferenceService.load(context),
  ]);
  const roleKeys = moduleSnapshot.roleKeys;
  const permissionKeys = moduleSnapshot.permissionKeys;
  const operationalContexts = contextsForRoleKeys(roleKeys);
  const authorized = contextualNavigation(operationalContexts, new Set(permissionKeys), false)
    .filter((item) => !isModuleKey(item.key) || moduleSnapshot.availability[item.key].available)
    .map((item) => ({
      ...item,
      label: isModuleKey(item.key) ? moduleLabel(item.key, moduleSnapshot.businessType) : item.label,
    }));
  const availableKeys = authorized.flatMap((item) => isModuleKey(item.key) ? [item.key] : []);
  const easyKeys = new Set(selectEasyModuleKeys(availableKeys, roleKeys));
  const pins = sanitizeNavigationPins(storedPins, new Set(authorized.map((item) => item.key)));
  const pinOrder = new Map(pins.map((key, index) => [key, index]));
  const items: NavigationAccessItem[] = authorized.map((item) => ({
    ...item,
    easyPrimary: isModuleKey(item.key) && easyKeys.has(item.key),
    pinnedOrder: pinOrder.get(item.key) ?? null,
  }));

  return {
    context,
    roleKeys,
    operationalContexts,
    permissionKeys,
    businessType: moduleSnapshot.businessType,
    experienceMode,
    moduleAvailability: moduleSnapshot.availability,
    items,
    customNavigation: pins.length > 0,
  };
});

export class NavigationAccessService {
  static async load(): Promise<NavigationAccess> {
    return loadNavigationAccess();
  }
}
