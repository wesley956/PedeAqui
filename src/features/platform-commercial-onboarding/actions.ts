"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { PlatformCommercialOnboardingService } from "@/server/platform/platform-commercial-onboarding-service";

const formSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  storeName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().max(240).optional(),
});

export async function provisionRestaurantAction(formData: FormData) {
  const parsed = formSchema.safeParse({
    organizationName: formData.get("organizationName"),
    storeName: formData.get("storeName"),
    ownerEmail: formData.get("ownerEmail") || "",
  });
  if (!parsed.success) redirect("/platform/novo-restaurante?error=invalid");

  try {
    const result = await PlatformCommercialOnboardingService.provision(parsed.data);
    const params = new URLSearchParams({
      created: "1",
      organizationId: result.organizationId,
      storeId: result.storeId,
      slug: result.storeSlug,
      invite: result.inviteDelivery,
    });
    redirect(`/platform/novo-restaurante?${params.toString()}`);
  } catch (error) {
    // Next.js redirect errors must escape untouched.
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/platform/novo-restaurante?error=failed");
  }
}
