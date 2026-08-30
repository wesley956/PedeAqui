import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const PUBLIC_PLAN_KEYS = ["essential", "professional", "management"] as const;
export type PublicPlanKey = (typeof PUBLIC_PLAN_KEYS)[number];

export type CommercialPlan = {
  id: string;
  key: PublicPlanKey;
  name: string;
  description: string;
  monthlyPriceCents: number;
  currency: string;
  featured: boolean;
  features: string[];
};

export type CommercialModule = {
  key: string;
  name: string;
  description: string;
  monthlyPriceCents: number;
};

const FALLBACK_TRIAL_DAYS = 15;

function isPublicPlanKey(value: string): value is PublicPlanKey {
  return (PUBLIC_PLAN_KEYS as readonly string[]).includes(value);
}

export function formatCommercialPrice(cents: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export class CommercialCatalogService {
  static async listPublicPlans(): Promise<CommercialPlan[]> {
    const admin = createAdminClient();
    const { data: plans, error } = await admin
      .from("plans")
      .select("id,key,name,description,monthly_price_cents,currency,position,metadata")
      .eq("active", true)
      .in("key", [...PUBLIC_PLAN_KEYS])
      .order("position", { ascending: true });

    if (error) throw new Error(`commercial_catalog_plans:${error.message}`);

    const ids = (plans ?? []).map((plan) => plan.id);
    const { data: featureRows, error: featureError } = ids.length
      ? await admin
          .from("plan_features")
          .select("plan_id,enabled,features(name)")
          .in("plan_id", ids)
          .eq("enabled", true)
      : { data: [], error: null };

    if (featureError) throw new Error(`commercial_catalog_features:${featureError.message}`);

    const featuresByPlan = new Map<string, string[]>();
    for (const row of featureRows ?? []) {
      const relation = row.features as unknown as { name?: string } | { name?: string }[] | null;
      const featureName = Array.isArray(relation) ? relation[0]?.name : relation?.name;
      if (!featureName) continue;
      const current = featuresByPlan.get(row.plan_id) ?? [];
      current.push(featureName);
      featuresByPlan.set(row.plan_id, current);
    }

    return (plans ?? [])
      .filter((plan): plan is typeof plan & { key: PublicPlanKey } => isPublicPlanKey(plan.key))
      .map((plan) => ({
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description ?? "",
        monthlyPriceCents: plan.monthly_price_cents,
        currency: plan.currency ?? "BRL",
        featured: plan.key === "professional",
        features: featuresByPlan.get(plan.id) ?? [],
      }));
  }

  static async getPublicPlan(key: string | null | undefined) {
    if (!key || !isPublicPlanKey(key)) return null;
    const plans = await this.listPublicPlans();
    return plans.find((plan) => plan.key === key) ?? null;
  }

  static async getTrialDays() {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", "commercial_trial_days")
      .eq("active", true)
      .maybeSingle();

    const value = data?.value;
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : value && typeof value === "object" && "days" in value
          ? Number((value as { days?: unknown }).days)
          : Number.NaN;

    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : FALLBACK_TRIAL_DAYS;
  }

  static async listCommercialModules(): Promise<CommercialModule[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("features")
      .select("key,name,description,metadata")
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) throw new Error(`commercial_catalog_modules:${error.message}`);

    return (data ?? []).flatMap((feature) => {
      const metadata = (feature.metadata ?? {}) as Record<string, unknown>;
      if (metadata.commercial_sellable !== true) return [];
      const monthlyPriceCents = Number(metadata.commercial_price_cents);
      if (!Number.isFinite(monthlyPriceCents) || monthlyPriceCents <= 0) return [];
      return [{
        key: feature.key,
        name: feature.name,
        description: feature.description ?? "",
        monthlyPriceCents,
      }];
    });
  }
}
