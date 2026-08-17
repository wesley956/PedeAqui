"use server";

import { revalidatePath } from "next/cache";
import { MetaEmbeddedSignupService } from "@/server/conversations/meta-embedded-signup-service";

export async function startWhatsAppEmbeddedSignupAction() {
  return MetaEmbeddedSignupService.start();
}

export async function completeWhatsAppEmbeddedSignupAction(input: {
  sessionId: string;
  stateToken: string;
  code: string;
  wabaId: string;
  phoneNumberId: string;
  businessId?: string | null;
}) {
  const result = await MetaEmbeddedSignupService.complete(input);
  revalidatePath("/configuracoes/conversas");
  revalidatePath("/conversas");
  return result;
}

export async function disconnectWhatsAppAction() {
  const result = await MetaEmbeddedSignupService.disconnect();
  revalidatePath("/configuracoes/conversas");
  revalidatePath("/conversas");
  return result;
}
