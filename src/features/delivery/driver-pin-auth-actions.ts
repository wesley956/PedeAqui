"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, STORE_COOKIE } from "@/server/access/context";
import { DriverPinAuthService } from "@/server/delivery/driver-pin-auth-service";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function setAccessCookies(organizationId: string, storeId: string) {
  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  cookieStore.set(ORG_COOKIE, organizationId, options);
  cookieStore.set(STORE_COOKIE, storeId, options);
}

export async function activateDriverPinAction(formData: FormData) {
  const token = text(formData, "token");
  const pin = text(formData, "pin");
  const confirmPin = text(formData, "confirmPin");
  const returnPath = `/primeiro-acesso-entregador?token=${encodeURIComponent(token)}`;

  if (!token || pin !== confirmPin) redirect(`${returnPath}&error=pin_mismatch`);

  try {
    const result = await DriverPinAuthService.activateEnrollment(token, pin);
    await setAccessCookies(result.organizationId, result.storeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = message.includes("6 números") ? "invalid_pin"
      : message.includes("expirou") || message.includes("utilizado") ? "expired"
        : message.includes("outro perfil") ? "account_conflict"
          : message.includes("outra conta") ? "phone_conflict"
            : "activation_failed";
    redirect(`${returnPath}&error=${code}`);
  }

  redirect("/entregador");
}

export async function driverPinSignInAction(formData: FormData) {
  try {
    const result = await DriverPinAuthService.signIn(text(formData, "phone"), text(formData, "pin"));
    await setAccessCookies(result.organizationId, result.storeId);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_credentials";
    const safeCode = ["invalid_credentials", "temporarily_locked", "access_unavailable"].includes(code) ? code : "invalid_input";
    redirect(`/acesso-entregador?error=${safeCode}`);
  }

  redirect("/entregador");
}
