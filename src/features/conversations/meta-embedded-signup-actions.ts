"use server";

import { revalidatePath } from "next/cache";
import type { WhatsAppConnectionMode } from "@/features/conversations/whatsapp-connection-model";
import { MetaEmbeddedSignupService } from "@/server/conversations/meta-embedded-signup-service";

export async function startWhatsAppEmbeddedSignupAction(mode: WhatsAppConnectionMode) {
  return MetaEmbeddedSignupService.start(mode);
}

export async function completeWhatsAppEmbeddedSignupAction(input: {
  sessionId: string;
  stateToken: string;
  code: string;
  wabaId: string;
  phoneNumberId?: string | null;
  businessId?: string | null;
  mode: WhatsAppConnectionMode;
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
