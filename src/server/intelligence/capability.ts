import type { ModuleAvailability } from "@/modules/module-access";
import type { BusinessType, ModuleKey } from "@/modules/module-catalog";
import type { IntelligenceContext } from "@/server/intelligence/context";

export const intelligenceCapabilityKeys = [
  "canAutoReply",
  "canSearchCatalog",
  "canCreateOrder",
  "canQuoteDelivery",
  "canTrackDelivery",
  "canShowGrowthBenefits",
  "canRedeemGrowthBenefits",
  "canOfferPix",
  "canMutateOrder",
  "canViewOperationalHealth",
] as const;

export type IntelligenceCapabilityKey = (typeof intelligenceCapabilityKeys)[number];
export type StoreOperationalStatus = "active" | "temporarily_closed" | "inactive";
export type ProviderReadiness = "not_required" | "connected" | "attention" | "disconnected" | "error";

export type CapabilityReason =
  | "allowed"
  | "scope_mismatch"
  | "feature_disabled"
  | "store_inactive"
  | "store_temporarily_closed"
  | "conversation_not_bot"
  | "module_disabled_by_store"
  | "module_not_supported_by_profile"
  | "module_missing_dependency"
  | "module_not_in_plan"
  | "module_permission_denied"
  | "module_temporarily_unavailable"
  | "permission_denied"
  | "provider_disconnected"
  | "provider_unhealthy"
  | "operational_config_disabled";

export type CapabilityDecision = {
  capability: IntelligenceCapabilityKey;
  allowed: boolean;
  reasons: CapabilityReason[];
  requiresAuthority: boolean;
};

export type CapabilityModuleFacts = Pick<ModuleAvailability, "available" | "reason" | "missingDependencies">;

export type CapabilityFacts = {
  organizationId: string;
  storeId: string;
  businessType: BusinessType;
  storeStatus: StoreOperationalStatus;
  modules: Readonly<Partial<Record<ModuleKey, CapabilityModuleFacts>>>;
  permissions: ReadonlySet<string>;
  featureFlags: Readonly<Partial<Record<IntelligenceCapabilityKey, boolean>>>;
  providerReadiness: Readonly<Partial<Record<IntelligenceCapabilityKey, ProviderReadiness>>>;
  operationalConfig: Readonly<Partial<Record<IntelligenceCapabilityKey, boolean>>>;
  revision: string;
};

export type CapabilitySnapshot = {
  organizationId: string;
  storeId: string;
  businessType: BusinessType;
  revision: string;
  decisions: Record<IntelligenceCapabilityKey, CapabilityDecision>;
};

type CapabilityRule = {
  modules: readonly ModuleKey[];
  permissions: readonly string[];
  requireActiveStore?: boolean;
  requireBotMode?: boolean;
  requiresAuthority?: boolean;
};

const rules: Record<IntelligenceCapabilityKey, CapabilityRule> = {
  canAutoReply: { modules: ["conversations"], permissions: [], requireActiveStore: true, requireBotMode: true },
  canSearchCatalog: { modules: ["catalog"], permissions: [] },
  canCreateOrder: { modules: ["orders", "catalog"], permissions: ["orders.create"], requireActiveStore: true },
  // Commercial delivery quoting is a checkout concern. It deliberately does not
  // require the managed `deliveries` operations module.
  canQuoteDelivery: { modules: ["orders", "catalog"], permissions: [], requireActiveStore: true },
  canTrackDelivery: { modules: ["deliveries"], permissions: [] },
  canShowGrowthBenefits: { modules: ["growth"], permissions: [] },
  canRedeemGrowthBenefits: { modules: ["growth"], permissions: ["growth.manage"], requireActiveStore: true },
  canOfferPix: { modules: ["orders"], permissions: [], requireActiveStore: true },
  canMutateOrder: { modules: ["orders"], permissions: ["orders.edit"], requireActiveStore: true, requiresAuthority: true },
  canViewOperationalHealth: { modules: ["dashboard"], permissions: ["dashboard.view"] },
};

const moduleReason: Record<Exclude<ModuleAvailability["reason"], "available">, CapabilityReason> = {
  disabled_by_store: "module_disabled_by_store",
  not_supported_by_profile: "module_not_supported_by_profile",
  missing_dependency: "module_missing_dependency",
  not_in_plan: "module_not_in_plan",
  permission_denied: "module_permission_denied",
  temporarily_unavailable: "module_temporarily_unavailable",
};

function pushUnique(reasons: CapabilityReason[], reason: CapabilityReason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function decide(context: IntelligenceContext, facts: CapabilityFacts, capability: IntelligenceCapabilityKey): CapabilityDecision {
  const rule = rules[capability];
  const reasons: CapabilityReason[] = [];

  if (context.organizationId !== facts.organizationId || context.storeId !== facts.storeId) pushUnique(reasons, "scope_mismatch");
  if (facts.featureFlags[capability] === false) pushUnique(reasons, "feature_disabled");
  if (facts.storeStatus === "inactive") pushUnique(reasons, "store_inactive");
  if (rule.requireActiveStore && facts.storeStatus === "temporarily_closed") pushUnique(reasons, "store_temporarily_closed");
  if (rule.requireBotMode && context.conversation.mode !== "bot") pushUnique(reasons, "conversation_not_bot");

  for (const moduleKey of rule.modules) {
    const moduleFact = facts.modules[moduleKey];
    if (!moduleFact || !moduleFact.available) {
      const reason = !moduleFact
        ? "module_disabled_by_store"
        : moduleFact.reason === "available"
          ? "module_temporarily_unavailable"
          : moduleReason[moduleFact.reason];
      pushUnique(reasons, reason);
    }
  }

  for (const permission of rule.permissions) {
    if (!facts.permissions.has(permission)) pushUnique(reasons, "permission_denied");
  }

  const provider = facts.providerReadiness[capability] ?? "not_required";
  if (provider === "disconnected") pushUnique(reasons, "provider_disconnected");
  if (provider === "error") pushUnique(reasons, "provider_unhealthy");
  if (facts.operationalConfig[capability] === false) pushUnique(reasons, "operational_config_disabled");

  return {
    capability,
    allowed: reasons.length === 0,
    reasons: reasons.length > 0 ? reasons : ["allowed"],
    requiresAuthority: rule.requiresAuthority === true,
  };
}

export class CapabilitySnapshotResolver {
  static resolve(context: IntelligenceContext, facts: CapabilityFacts): CapabilitySnapshot {
    return {
      organizationId: facts.organizationId,
      storeId: facts.storeId,
      businessType: facts.businessType,
      revision: facts.revision,
      decisions: Object.fromEntries(
        intelligenceCapabilityKeys.map((capability) => [capability, decide(context, facts, capability)]),
      ) as Record<IntelligenceCapabilityKey, CapabilityDecision>,
    };
  }
}
