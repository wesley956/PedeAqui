"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeInternalPath } from "@/lib/auth/safe-return-path";
import { normalizeAppUrl } from "@/lib/app-url";
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
  return normalizeAppUrl(process.env.APP_URL, "http://localhost:3000");
}

function loginErrorPath(error: string, returnPath: string | null, entry: string | null) {
  if (entry === "driver") return `/acesso-entregador?error=${error}`;
  const next = returnPath ? `&next=${encodeURIComponent(returnPath)}` : "";
  return `/login?error=${error}${next}`;
}

function signupPath(error: string | null, returnPath: string | null) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (returnPath) params.set("next", returnPath);
  const query = params.toString();
  return `/cadastro${query ? `?${query}` : ""}`;
}

export async function signInAction(formData: FormData) {
  const parsed = getCredentials(formData);
  const returnPath = safeInternalPath(typeof formData.get("next") === "string" ? String(formData.get("next")) : null);
  const entry = formData.get("entry") === "driver" ? "driver" : null;
  if (!parsed.success) redirect(loginErrorPath("invalid_input", returnPath, entry));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect(loginErrorPath("invalid_credentials", returnPath, entry));

  // Explicit internal deep links win. Only a generic login uses the operational start route.
  redirect(returnPath ?? await StartRouteService.resolve());
}

export async function signUpAction(formData: FormData) {
  const parsed = getCredentials(formData);
  const returnPath = safeInternalPath(typeof formData.get("next") === "string" ? String(formData.get("next")) : null, "/onboarding") ?? "/onboarding";
  if (!parsed.success) redirect(signupPath("invalid_input", returnPath));

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(returnPath)}`,
    },
  });
  if (error) redirect(signupPath("signup_failed", returnPath));

  redirect(`/login?status=check_email&next=${encodeURIComponent(returnPath)}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/recuperar-senha?error=invalid_email");

  const supabase = await createClient();
  // Intentionally return the same UI result regardless of account existence.
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/nova-senha`,
  });
  redirect("/recuperar-senha?status=sent");
}

export async function updatePasswordAction(formData: FormData) {
  const password = z.string().min(8).max(128).safeParse(formData.get("password"));
  if (!password.success) redirect("/nova-senha?error=invalid_password");

  const supabase = await createClient();
  const { data: userData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !userData.user) redirect("/login?error=session_expired&next=/nova-senha");

  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) redirect("/nova-senha?error=update_failed");

  redirect(await StartRouteService.resolve());
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
