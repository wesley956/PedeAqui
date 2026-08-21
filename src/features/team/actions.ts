"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeInternalPath } from "@/lib/auth/safe-return-path";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE, STORE_COOKIE } from "@/server/access/context";
import { requireAuthenticatedUser } from "@/server/auth/session";

const tokenSchema = z.string().min(20).max(256);

export async function acceptInvitationAction(formData: FormData) {
  await requireAuthenticatedUser();
  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) redirect("/convite?error=invalid_token");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", {
    raw_token: parsed.data,
  });

  if (error || !data || typeof data !== "object") {
    redirect("/convite?error=accept_failed");
  }

  const result = data as { organization_id?: string; store_id?: string | null; next_path?: string | null };
  if (!result.organization_id) redirect("/convite?error=accept_failed");

  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };

  cookieStore.set(ORG_COOKIE, result.organization_id, options);
  if (result.store_id) cookieStore.set(STORE_COOKIE, result.store_id, options);

  redirect(safeInternalPath(result.next_path, "/dashboard") ?? "/dashboard");
}
