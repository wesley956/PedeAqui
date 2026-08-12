"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConversationService } from "@/server/conversations/conversation-service";

function conversationId(formData: FormData) {
  return String(formData.get("conversationId") ?? "");
}

export async function assumeConversationAction(formData: FormData) {
  const id = conversationId(formData);
  await ConversationService.transition({ conversationId: id, targetState: "human", reason: "Atendimento assumido" });
  await ConversationService.markRead(id);
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}

export async function queueConversationAction(formData: FormData) {
  const id = conversationId(formData);
  await ConversationService.transition({ conversationId: id, targetState: "waiting_agent", reason: "Encaminhada para fila humana" });
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}

export async function returnConversationToBotAction(formData: FormData) {
  const id = conversationId(formData);
  await ConversationService.transition({ conversationId: id, targetState: "bot", reason: "Atendimento devolvido ao bot" });
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}

export async function closeConversationAction(formData: FormData) {
  const id = conversationId(formData);
  await ConversationService.transition({ conversationId: id, targetState: "closed", reason: String(formData.get("reason") ?? "Atendimento encerrado") });
  revalidatePath("/conversas");
  redirect("/conversas");
}

export async function markConversationReadAction(formData: FormData) {
  const id = conversationId(formData);
  await ConversationService.markRead(id);
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}

export async function sendConversationMessageAction(formData: FormData) {
  const id = conversationId(formData);
  try {
    await ConversationService.sendAgentText({
      conversationId: id,
      body: String(formData.get("body") ?? ""),
      clientMessageId: String(formData.get("clientMessageId") ?? ""),
    });
  } catch {
    redirect(`/conversas?conversation=${encodeURIComponent(id)}&erro=send_failed`);
  }
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}
