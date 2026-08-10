"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

export async function signInAction(formData: FormData) {
  const parsed = getCredentials(formData);
  if (!parsed.success) redirect("/login?error=invalid_input");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login?error=invalid_credentials");

  redirect("/dashboard");
}

export async function signUpAction(formData: FormData) {
  const parsed = getCredentials(formData);
  if (!parsed.success) redirect("/cadastro?error=invalid_input");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) redirect("/cadastro?error=signup_failed");

  redirect("/login?status=check_email");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) redirect("/recuperar-senha?error=invalid_email");

  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${appUrl}/nova-senha`,
  });

  // Always return the same result to avoid account enumeration.
  redirect("/recuperar-senha?status=sent");
}

export async function updatePasswordAction(formData: FormData) {
  const password = z.string().min(8).max(128).safeParse(formData.get("password"));
  if (!password.success) redirect("/nova-senha?error=invalid_password");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) redirect("/nova-senha?error=update_failed");

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
