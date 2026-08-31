"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeInternalPath } from "@/lib/auth/safe-return-path";
import { normalizeAppUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StartRouteService } from "@/server/access/start-route-service";
import { PUBLIC_PLAN_KEYS } from "@/server/billing/commercial-catalog-service";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

function getCredentials(formData: FormData) {
  return credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
}

function getAppUrl() {
  return normalizeAppUrl(process.env.APP_URL, "http://localhost:3000");
}

function loginErrorPath(error: string, returnPath: string | null, entry: string | null) {
  if (entry === "driver") return `/acesso-entregador?error=${error}`;
  const next = returnPath ? `&next=${encodeURIComponent(returnPath)}` : "";
  return `/login?error=${error}${next}`;
}

function signupPath(error: string | null, returnPath: string | null, plan?: string | null) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (returnPath) params.set("next", returnPath);
  if (plan) params.set("plan", plan);
  const query = params.toString();
  return `/cadastro${query ? `?${query}` : ""}`;
}

async function loginGuardKey(email: string) {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret = process.env.LOGIN_GUARD_SECRET ?? process.env.SUPPORT_MODE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Login guard secret unavailable");
  return createHmac("sha256", secret).update(`${email.trim().toLowerCase()}:${forwarded}`).digest("hex");
}

export async function signInAction(formData: FormData) {
  const parsed = getCredentials(formData);
  const returnPath = safeInternalPath(typeof formData.get("next") === "string" ? String(formData.get("next")) : null);
  const entry = formData.get("entry") === "driver" ? "driver" : null;
  if (!parsed.success) redirect(loginErrorPath("invalid_input", returnPath, entry));

  const guardKey = await loginGuardKey(parsed.data.email);
  const admin = createAdminClient();
  const guard = await admin.rpc("auth_login_guard_internal", { p_key_hash: guardKey });
  if (guard.error) redirect(loginErrorPath("auth_unavailable", returnPath, entry));
  if (guard.data?.allowed === false) redirect(loginErrorPath("too_many_attempts", returnPath, entry));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const failure = await admin.rpc("auth_login_failure_internal", { p_key_hash: guardKey });
    if (failure.data?.allowed === false) redirect(loginErrorPath("too_many_attempts", returnPath, entry));
    redirect(loginErrorPath("invalid_credentials", returnPath, entry));
  }
  await admin.rpc("auth_login_success_internal", { p_key_hash: guardKey });
  redirect(returnPath ?? await StartRouteService.resolve());
}

export async function signUpAction(formData: FormData) {
  const parsed = getCredentials(formData);
  const requestedPlan = typeof formData.get("plan") === "string" ? String(formData.get("plan")) : "";
  const plan = (PUBLIC_PLAN_KEYS as readonly string[]).includes(requestedPlan) ? requestedPlan : null;
  const requestedNext = typeof formData.get("next") === "string" ? String(formData.get("next")) : null;
  const fallback = plan ? `/onboarding?plan=${plan}` : "/onboarding";
  const returnPath = safeInternalPath(requestedNext, fallback) ?? fallback;
  if (!parsed.success || !plan) redirect(signupPath("invalid_input", returnPath, plan));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(returnPath)}`,
      data: { selected_plan_key: plan },
    },
  });

  const duplicate = Boolean(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
  if (duplicate || error?.message?.toLowerCase().includes("already registered") || error?.message?.toLowerCase().includes("already been registered")) {
    redirect(signupPath("email_exists", returnPath, plan));
  }
  if (error) redirect(signupPath("signup_failed", returnPath, plan));

  if (data.session) redirect(returnPath);
  redirect(`/login?status=check_email&next=${encodeURIComponent(returnPath)}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/recuperar-senha?error=invalid_email");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${getAppUrl()}/auth/callback?next=/nova-senha` });
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
