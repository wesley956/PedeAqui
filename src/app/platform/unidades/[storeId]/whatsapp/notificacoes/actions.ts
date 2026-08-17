"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  PlatformWhatsAppOrderTemplateError,
  PlatformWhatsAppOrderTemplateService,
} from "@/server/platform/platform-whatsapp-order-template-service";

const storeIdSchema = z.string().uuid();

export async function prepareOrderTemplateAction(formData: FormData) {
  const parsed = storeIdSchema.safeParse(formData.get("storeId"));
  if (!parsed.success) redirect("/platform?error=invalid_store");
  const storeId = parsed.data;
  try {
    const state = await PlatformWhatsAppOrderTemplateService.ensure(storeId);
    revalidatePath(`/platform/unidades/${storeId}/whatsapp/notificacoes`);
    revalidatePath(`/platform/unidades/${storeId}/whatsapp`);
    const status = state.status.toLowerCase();
    redirect(`/platform/unidades/${storeId}/whatsapp/notificacoes?template=${encodeURIComponent(status)}`);
  } catch (error) {
    const code = error instanceof PlatformWhatsAppOrderTemplateError ? error.code : "unexpected";
    redirect(`/platform/unidades/${storeId}/whatsapp/notificacoes?error=${encodeURIComponent(code)}`);
  }
}
