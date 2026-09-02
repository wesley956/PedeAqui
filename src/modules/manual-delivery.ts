import type { ModuleKey } from "@/modules/module-catalog";

export const DELIVERY_OPERATION_LEVELS = ["manual", "dispatch_simple", "driver_connected", "advanced"] as const;
export type DeliveryOperationLevel = typeof DELIVERY_OPERATION_LEVELS[number];

export function resolveDeliveryOperationLevel(configured: DeliveryOperationLevel | null | undefined, enabledModuleKeys: ReadonlySet<ModuleKey>): DeliveryOperationLevel {
  if (configured === "manual") return "manual";
  if (configured === "dispatch_simple" && enabledModuleKeys.has("deliveries")) return configured;
  if ((configured === "driver_connected" || configured === "advanced") && enabledModuleKeys.has("deliveries") && enabledModuleKeys.has("driver")) return configured;
  if (!enabledModuleKeys.has("deliveries")) return "manual";
  if (!enabledModuleKeys.has("driver")) return "dispatch_simple";
  return "driver_connected";
}

/**
 * Delivery is handled directly from the order flow whenever either logistics
 * surface is disabled for the store. Permissions are intentionally not part of
 * this decision: a user without delivery permission must not gain a manual
 * bypass while the store still uses managed logistics.
 */
export function isManualDeliveryMode(enabledModuleKeys: ReadonlySet<ModuleKey>, configured?: DeliveryOperationLevel | null) {
  return resolveDeliveryOperationLevel(configured, enabledModuleKeys) === "manual";
}

export function isOfflineDeliveryPayment(method: string | null | undefined) {
  return method === "cash" || method === "credit_card" || method === "debit_card";
}
