"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  PlatformWhatsAppManualError,
  PlatformWhatsAppManualService,
} from "@/server/platform/platform-whatsapp-manual-service";

const storeIdSchema = z.string().uuid();

function safeStoreId(formData: FormData) {
  const parsed = storeIdSchema.safeParse(formData.get("storeId"));
  return parsed.success ? parsed.data : null;
}

function successRedirect(storeId: string, status: string): never {
  revalidatePath("/platform");
  revalidatePath(`/platform/unidades/${storeId}`);
  revalidatePath(`/platform/unidades/${storeId}/whatsapp`);
  redirect(`/platform/unidades/${storeId}/whatsapp?status=${encodeURIComponent(status)}`);
}

function errorRedirect(storeId: string | null, error: unknown): never {
  const code = error instanceof PlatformWhatsAppManualError ? error.code : "unexpected";
  if (!storeId) redirect("/platform?error=invalid_store");
  redirect(`/platform/unidades/${storeId}/whatsapp?error=${encodeURIComponent(code)}`);
}

export async function connectManualWhatsAppAction(formData: FormData) {
  const storeId = safeStoreId(formData);
  if (!storeId) errorRedirect(null, new Error("invalid store"));
  try {
    await PlatformWhatsAppManualService.connect({
      storeId,
      wabaId: String(formData.get("wabaId") ?? ""),
      phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
    });
  } catch (error) {
    errorRedirect(storeId, error);
  }
  successRedirect(storeId, "connected");
}

export async function revalidateManualWhatsAppAction(formData: FormData) {
  const storeId = safeStoreId(formData);
  if (!storeId) errorRedirect(null, new Error("invalid store"));
  try {
    await PlatformWhatsAppManualService.revalidate(storeId);
  } catch (error) {
    errorRedirect(storeId, error);
  }
  successRedirect(storeId, "revalidated");
}
