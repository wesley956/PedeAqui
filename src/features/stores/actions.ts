"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext, STORE_COOKIE } from "@/server/access/context";
import { StoreProfileService } from "@/server/stores/store-profile-service";

const storeIdSchema = z.string().uuid();
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function switchStoreAction(formData: FormData) {
  const parsed = storeIdSchema.safeParse(formData.get("storeId"));
  if (!parsed.success) redirect("/dashboard?error=invalid_store");

  const context = await getAccessContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id")
    .eq("id", parsed.data)
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) redirect("/dashboard?error=store_not_allowed");

  const cookieStore = await cookies();
  cookieStore.set(STORE_COOKIE, data.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/dashboard");
}

export async function saveStoreProfileAction(formData: FormData) {
  const store = await StoreProfileService.updateProfile({
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    email: field(formData, "email"),
    postalCode: field(formData, "postalCode"),
    street: field(formData, "street"),
    number: field(formData, "number"),
    complement: field(formData, "complement"),
    district: field(formData, "district"),
    city: field(formData, "city"),
    state: field(formData, "state"),
    publicWhatsapp: field(formData, "publicWhatsapp"),
    websiteUrl: field(formData, "websiteUrl"),
    instagramUrl: field(formData, "instagramUrl"),
    facebookUrl: field(formData, "facebookUrl"),
    tiktokUrl: field(formData, "tiktokUrl"),
  });

  revalidatePath("/inicio");
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/loja");
  revalidatePath(`/m/${store.slug}`);
  redirect("/inicio?guia=1");
}
