"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAccessContext, STORE_COOKIE } from "@/server/access/context";

const storeIdSchema = z.string().uuid();

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
