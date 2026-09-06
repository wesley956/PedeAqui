export const EXTERNAL_CAPABILITY_KEYS = [
  "ifood_orders",
  "ifood_catalog",
  "ifood_shipping",
  "99food_orders",
  "99food_menu",
  "99food_logistics",
  "99entrega",
] as const;

export type ExternalCapabilityKey = (typeof EXTERNAL_CAPABILITY_KEYS)[number];

export const INTEGRATION_PROVIDERS = ["ifood", "99food", "99entrega"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export type IntegrationHealth =
  | "connected"
  | "attention"
  | "action_required"
  | "unavailable"
  | "disconnected";

export type ExternalCapabilityState = {
  enabled: boolean;
  health: IntegrationHealth;
};

/**
 * Safe baseline for every tenant. Merely connecting an account must never
 * activate a provider capability implicitly.
 */
export const DEFAULT_EXTERNAL_CAPABILITIES: Readonly<Record<ExternalCapabilityKey, ExternalCapabilityState>> =
  Object.freeze(
    Object.fromEntries(
      EXTERNAL_CAPABILITY_KEYS.map((key) => [key, Object.freeze({ enabled: false, health: "disconnected" as const })]),
    ) as Record<ExternalCapabilityKey, ExternalCapabilityState>,
  );

export function externalCapabilitiesOff(): Record<ExternalCapabilityKey, ExternalCapabilityState> {
  return Object.fromEntries(
    EXTERNAL_CAPABILITY_KEYS.map((key) => [key, { enabled: false, health: "disconnected" as const }]),
  ) as Record<ExternalCapabilityKey, ExternalCapabilityState>;
}

export function isExternalCapabilityKey(value: string): value is ExternalCapabilityKey {
  return (EXTERNAL_CAPABILITY_KEYS as readonly string[]).includes(value);
}
