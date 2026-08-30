"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_TYPES, isModuleKey, modulesForPreset } from "@/modules/module-catalog";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { ORG_COOKIE, STORE_COOKIE } from "@/server/access/context";
import { logger } from "@/server/observability/logger";
import { isStoreSlugConflict, storeSlugCandidate } from "@/server/onboarding/store-slug";
import { CommercialCatalogService, PUBLIC_PLAN_KEYS } from "@/server/billing/commercial-catalog-service";

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  storeName: z.string().trim().min(2).max(120),
  businessType: z.enum(BUSINESS_TYPES),
  planKey: z.enum(PUBLIC_PLAN_KEYS),
});
const MAX_STORE_SLUG_ATTEMPTS = 20;

export async function bootstrapOrganizationAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const parsed = onboardingSchema.safeParse({
    organizationName: formData.get("organizationName"), storeName: formData.get("storeName"),
    businessType: formData.get("businessType"), planKey: formData.get("planKey"),
  });
  if (!parsed.success) redirect("/onboarding?error=invalid_input");

  const admin = createAdminClient();
  const { data: plan, error: planError } = await admin.from("plans")
    .select("id,key,monthly_price_cents,currency,current_version_id")
    .eq("key", parsed.data.planKey).eq("active", true).single();
  if (planError || !plan) redirect(`/onboarding?plan=${parsed.data.planKey}&error=invalid_plan`);

  const { data: entitlementRows, error: entitlementError } = await admin.from("plan_features")
    .select("enabled,features(key)").eq("plan_id", plan.id).eq("enabled", true);
  if (entitlementError) redirect(`/onboarding?plan=${parsed.data.planKey}&error=plan_failed`);
  const requestedModules = (entitlementRows ?? []).flatMap((row) => {
    const relation = row.features as unknown as { key?: string } | { key?: string }[] | null;
    const key = Array.isArray(relation) ? relation[0]?.key : relation?.key;
    return key && isModuleKey(key) ? [key] : [];
  });
  const enabledModules = modulesForPreset(parsed.data.businessType, "custom", requestedModules);
  const supabase = await createClient();

  const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, status: "active" }, { onConflict: "id" });
  if (profileError) redirect(`/onboarding?plan=${parsed.data.planKey}&error=profile_failed`);

  let bootstrapData: unknown = null;
  for (let attempt = 0; attempt < MAX_STORE_SLUG_ATTEMPTS; attempt += 1) {
    const storeSlug = storeSlugCandidate(parsed.data.storeName, attempt);
    const { data, error } = await supabase.rpc("bootstrap_organization_modular", {
      organization_name: parsed.data.organizationName, store_name: parsed.data.storeName, store_slug: storeSlug,
      p_business_type: parsed.data.businessType, p_module_preset: "custom", p_enabled_modules: enabledModules,
    });
    if (!error) { bootstrapData = data; break; }
    if (isStoreSlugConflict(error) && attempt < MAX_STORE_SLUG_ATTEMPTS - 1) continue;
    logger.error("onboarding_bootstrap_failed", { userId: user.id, errorCode: error.code, errorMessage: error.message });
    redirect(`/onboarding?plan=${parsed.data.planKey}&error=bootstrap_failed`);
  }

  const result = bootstrapData as { organization_id?: string; store_id?: string } | null;
  if (!result?.organization_id || !result.store_id) redirect(`/onboarding?plan=${parsed.data.planKey}&error=bootstrap_failed`);

  const trialDays = await CommercialCatalogService.getTrialDays();
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + trialDays * 86_400_000);
  const { error: subscriptionError } = await admin.from("organization_subscriptions").insert({
    organization_id: result.organization_id,
    plan_id: plan.id,
    plan_version_id: plan.current_version_id,
    status: "trialing",
    billing_interval: "month",
    current_period_start: trialStart.toISOString(),
    current_period_end: trialEnd.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
    next_due_at: trialEnd.toISOString(),
    agreed_price_cents: plan.monthly_price_cents,
    price_currency: plan.currency ?? "BRL",
    price_locked: false,
    payment_status: "not_started",
    grace_period_days: 3,
    idempotency_key: `onboarding:${result.organization_id}`,
    metadata: { source: "commercial_onboarding", selected_plan_key: parsed.data.planKey, trial_days: trialDays },
  });
  if (subscriptionError && subscriptionError.code !== "23505") {
    logger.error("onboarding_subscription_failed", { organizationId: result.organization_id, errorCode: subscriptionError.code, errorMessage: subscriptionError.message });
    redirect(`/onboarding?plan=${parsed.data.planKey}&error=subscription_failed`);
  }
  await admin.from("stores").update({ trial_ends_at: trialEnd.toISOString() }).eq("id", result.store_id);

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(ORG_COOKIE, result.organization_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  cookieStore.set(STORE_COOKIE, result.store_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  redirect("/dashboard");
}
