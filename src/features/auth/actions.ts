"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { StartRouteService } from "@/server/access/start-route-service";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

function getCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function getSafeReturnPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function loginErrorPath(error: string, returnPath: string | null) {
  const next = returnPath ? `&next=${encodeURIComponent(returnPath)}` : "";
  return `/login?error=${error}${next}`;
}

export async function signInAction(formData: FormData) {
  const parsed = getCredentials(formData);
  const returnPath = getSafeReturnPath(formData.get("next"));
  if (!parsed.success) redirect(loginErrorPath("invalid_input", returnPath));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(loginErrorPath("invalid_credentials", returnPath));

  // Explicit deep links win. Only a generic login uses the operational start route.
  redirect(returnPath ?? await StartRouteService.resolve());
}

export async function signUpAction(formData: FormData) {
  const parsed = getCredentials(formData);
  if (!parsed.success) redirect("/cadastro?error=invalid_input");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/onboarding`,
    },
  });
  if (error) redirect("/cadastro?error=signup_failed");

  redirect("/login?status=check_email");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/recuperar-senha?error=invalid_email");

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/nova-senha`,
  });

  // Same result regardless of account existence to reduce enumeration.
  redirect("/recuperar-senha?status=sent");
}

export async function updatePasswordAction(formData: FormData) {
  const password = z.string().min(8).max(128).safeParse(formData.get("password"));
  if (!password.success) redirect("/nova-senha?error=invalid_password");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) redirect("/nova-senha?error=update_failed");

  redirect(await StartRouteService.resolve());
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
