"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { BUSINESS_TYPES } from "@/modules/module-catalog";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { ORG_COOKIE, STORE_COOKIE } from "@/server/access/context";
import { logger } from "@/server/observability/logger";
import { isStoreSlugConflict, storeSlugCandidate } from "@/server/onboarding/store-slug";
import { PUBLIC_PLAN_KEYS } from "@/server/billing/commercial-catalog-service";

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
    organizationName: formData.get("organizationName"),
    storeName: formData.get("storeName"),
    businessType: formData.get("businessType"),
    planKey: formData.get("planKey"),
  });
  if (!parsed.success) redirect("/onboarding?error=invalid_input");

  // Toda a criação comercial (perfil, empresa, loja, assinatura, trial e módulos)
  // acontece dentro do RPC transacional. Assim uma falha não deixa cadastro parcial.
  const supabase = await createClient();
  let bootstrapData: unknown = null;
  for (let attempt = 0; attempt < MAX_STORE_SLUG_ATTEMPTS; attempt += 1) {
    const storeSlug = storeSlugCandidate(parsed.data.storeName, attempt);
    const { data, error } = await supabase.rpc("bootstrap_commercial_organization", {
      p_organization_name: parsed.data.organizationName,
      p_store_name: parsed.data.storeName,
      p_store_slug: storeSlug,
      p_business_type: parsed.data.businessType,
      p_plan_key: parsed.data.planKey,
    });
    if (!error) {
      bootstrapData = data;
      break;
    }
    if (isStoreSlugConflict(error) && attempt < MAX_STORE_SLUG_ATTEMPTS - 1) continue;
    logger.error("commercial_onboarding_bootstrap_failed", {
      userId: user.id,
      attempt: attempt + 1,
      errorCode: error.code,
      errorMessage: error.message,
    });
    redirect(`/onboarding?plan=${parsed.data.planKey}&error=bootstrap_failed`);
  }

  const result = bootstrapData as {
    organization_id?: string;
    store_id?: string;
    subscription_id?: string;
    reused?: boolean;
  } | null;
  if (!result?.organization_id || !result.store_id) {
    redirect(`/onboarding?plan=${parsed.data.planKey}&error=bootstrap_failed`);
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(ORG_COOKIE, result.organization_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  cookieStore.set(STORE_COOKIE, result.store_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  redirect("/dashboard");
}
