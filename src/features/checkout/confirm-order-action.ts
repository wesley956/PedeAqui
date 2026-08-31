"use server";

import { redirect } from "next/navigation";
import { createOrderFromCheckoutAction } from "@/features/orders/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubscriptionLifecycleService } from "@/server/billing/subscription-lifecycle-service";
import { CheckoutError } from "@/server/checkout/checkout-service";

async function assertStoreOperationalAccess(storeSlug: string) {
  if (!storeSlug) return;

  const admin = createAdminClient();
  const { data: store, error } = await admin
    .from("stores")
    .select("organization_id")
    .ilike("slug", storeSlug)
    .maybeSingle();
  if (error) throw error;
  if (!store) return;

  const access = await SubscriptionLifecycleService.accessForOrganization(store.organization_id);
  if (!access.operationalAccess) {
    throw new CheckoutError(
      "store_subscription_unavailable",
      "Este estabelecimento está temporariamente indisponível para novos pedidos online.",
    );
  }
}

export async function confirmCheckoutOrderAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  try {
    await assertStoreOperationalAccess(storeSlug);
    await createOrderFromCheckoutAction(formData);
  } catch (error) {
    if (error instanceof CheckoutError) {
      redirect(`/m/${storeSlug}/checkout?erro=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}
