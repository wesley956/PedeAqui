"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { ORG_COOKIE, STORE_COOKIE } from "@/server/access/context";
import { logger } from "@/server/observability/logger";
import { isStoreSlugConflict, storeSlugCandidate } from "@/server/onboarding/store-slug";

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  storeName: z.string().trim().min(2).max(120),
});

const MAX_STORE_SLUG_ATTEMPTS = 20;

export async function bootstrapOrganizationAction(formData: FormData) {
  const user = await requireAuthenticatedUser();

  const parsed = onboardingSchema.safeParse({
    organizationName: formData.get("organizationName"),
    storeName: formData.get("storeName"),
  });

  if (!parsed.success) redirect("/onboarding?error=invalid_input");

  const supabase = await createClient();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      status: "active",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    logger.error("onboarding_profile_upsert_failed", {
      userId: user.id,
      errorCode: profileError.code,
      errorMessage: profileError.message,
    });
    redirect("/onboarding?error=profile_failed");
  }

  let bootstrapData: unknown = null;

  for (let attempt = 0; attempt < MAX_STORE_SLUG_ATTEMPTS; attempt += 1) {
    const storeSlug = storeSlugCandidate(parsed.data.storeName, attempt);
    const { data, error } = await supabase.rpc("bootstrap_organization", {
      organization_name: parsed.data.organizationName,
      store_name: parsed.data.storeName,
      store_slug: storeSlug,
    });

    if (!error) {
      bootstrapData = data;
      break;
    }

    if (isStoreSlugConflict(error) && attempt < MAX_STORE_SLUG_ATTEMPTS - 1) {
      logger.warn("onboarding_store_slug_conflict", {
        userId: user.id,
        attempt: attempt + 1,
      });
      continue;
    }

    logger.error("onboarding_bootstrap_failed", {
      userId: user.id,
      attempt: attempt + 1,
      errorCode: error.code,
      errorMessage: error.message,
    });
    redirect("/onboarding?error=bootstrap_failed");
  }

  if (!bootstrapData || typeof bootstrapData !== "object") {
    logger.error("onboarding_bootstrap_missing_result", {
      userId: user.id,
      attempts: MAX_STORE_SLUG_ATTEMPTS,
    });
    redirect("/onboarding?error=bootstrap_failed");
  }

  const result = bootstrapData as { organization_id?: string; store_id?: string };
  if (!result.organization_id || !result.store_id) {
    logger.error("onboarding_bootstrap_invalid_result", { userId: user.id });
    redirect("/onboarding?error=bootstrap_failed");
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(ORG_COOKIE, result.organization_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  cookieStore.set(STORE_COOKIE, result.store_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });

  redirect("/dashboard");
}
