import type { ModuleKey } from "@/modules/module-catalog";

export const EXPERIENCE_MODES = ["standard", "easy"] as const;
export type ExperienceMode = (typeof EXPERIENCE_MODES)[number];

const EASY_ROLE_PRIORITIES: Record<string, readonly ModuleKey[]> = {
  owner: ["dashboard", "orders", "catalog", "pdv", "deliveries", "settings", "cash"],
  manager: ["orders", "dining", "production", "deliveries", "dashboard", "cash"],
  cashier: ["pdv", "cash", "orders", "customers"],
  attendant: ["orders", "customers", "deliveries", "conversations", "pdv"],
  waiter: ["dining", "orders", "pdv", "customers"],
  kitchen: ["production", "orders"],
  driver: ["driver", "deliveries", "orders"],
  financial: ["finance", "dashboard", "orders"],
};

export function isExperienceMode(value: string): value is ExperienceMode {
  return (EXPERIENCE_MODES as readonly string[]).includes(value);
}

/** Easy Mode only chooses priorities from an already-authorized module list. */
export function selectEasyModuleKeys(
  availableModuleKeys: readonly ModuleKey[],
  roleKeys: readonly string[],
  limit = 6,
): ModuleKey[] {
  const available = new Set(availableModuleKeys);
  const selected: ModuleKey[] = [];
  const preferred = [...new Set(roleKeys.flatMap((roleKey) => EASY_ROLE_PRIORITIES[roleKey] ?? []))];

  for (const key of preferred) {
    if (available.has(key) && !selected.includes(key)) selected.push(key);
    if (selected.length >= limit) return selected;
  }

  for (const key of availableModuleKeys) {
    if (!selected.includes(key)) selected.push(key);
    if (selected.length >= limit) break;
  }
  return selected;
}
