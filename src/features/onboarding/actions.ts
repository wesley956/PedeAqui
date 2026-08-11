"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { ORG_COOKIE, STORE_COOKIE } from "@/server/access/context";

const onboardingSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  storeName: z.string().trim().min(2).max(120),
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

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

  if (profileError) redirect("/onboarding?error=profile_failed");

  const storeSlug = slugify(parsed.data.storeName);
  const { data, error } = await supabase.rpc("bootstrap_organization", {
    organization_name: parsed.data.organizationName,
    store_name: parsed.data.storeName,
    store_slug: storeSlug,
  });

  if (error || !data || typeof data !== "object") {
    redirect("/onboarding?error=bootstrap_failed");
  }

  const result = data as { organization_id?: string; store_id?: string };
  if (!result.organization_id || !result.store_id) {
    redirect("/onboarding?error=bootstrap_failed");
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  cookieStore.set(ORG_COOKIE, result.organization_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  cookieStore.set(STORE_COOKIE, result.store_id, { httpOnly: true, sameSite: "lax", secure, path: "/" });

  redirect("/dashboard");
}
