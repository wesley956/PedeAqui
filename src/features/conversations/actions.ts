"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ConversationBotResumeService } from "@/server/conversations/conversation-bot-resume-service";
import { ConversationClaimConflictError, ConversationClaimService } from "@/server/conversations/conversation-claim-service";
import { ConversationService } from "@/server/conversations/conversation-service";
import { ConversationSendPolicyError } from "@/server/conversations/whatsapp-send-policy";

function conversationId(formData: FormData) {
  return String(formData.get("conversationId") ?? "");
}

function sendErrorCode(error: unknown, fallback: string) {
  if (error instanceof ConversationSendPolicyError) return error.code;
  return fallback;
}

export async function assumeConversationAction(formData: FormData) {
  const id = conversationId(formData);
  try {
    await ConversationClaimService.assume(id);
  } catch (error) {
    if (error instanceof ConversationClaimConflictError) {
      revalidatePath("/conversas");
      redirect(`/conversas?conversation=${encodeURIComponent(id)}&erro=already_assigned`);
    }
    throw error;
  }
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
  await ConversationBotResumeService.resume(id);
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
  } catch (error) {
    redirect(`/conversas?conversation=${encodeURIComponent(id)}&erro=${encodeURIComponent(sendErrorCode(error, "send_failed"))}`);
  }
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}

export async function sendConversationMediaAction(formData: FormData) {
  const id = conversationId(formData);
  const file = formData.get("file");
  try {
    if (!(file instanceof File)) throw new Error("Arquivo inválido.");
    await ConversationService.sendAgentMedia({
      conversationId: id,
      file,
      caption: String(formData.get("caption") ?? ""),
      clientMessageId: String(formData.get("clientMessageId") ?? ""),
    });
  } catch (error) {
    redirect(`/conversas?conversation=${encodeURIComponent(id)}&erro=${encodeURIComponent(sendErrorCode(error, "media_failed"))}`);
  }
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}

export async function sendConversationTemplateAction(formData: FormData) {
  const id = conversationId(formData);
  const templateKey = String(formData.get("templateKey") ?? "");
  const separator = templateKey.lastIndexOf("::");
  const templateName = separator > 0 ? templateKey.slice(0, separator) : "";
  const languageCode = separator > 0 ? templateKey.slice(separator + 2) : "";
  const parameters = String(formData.get("parameters") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  try {
    await ConversationService.sendAgentTemplate({
      conversationId: id,
      templateName,
      languageCode,
      bodyParameters: parameters,
      clientMessageId: String(formData.get("clientMessageId") ?? ""),
    });
  } catch (error) {
    redirect(`/conversas?conversation=${encodeURIComponent(id)}&erro=${encodeURIComponent(sendErrorCode(error, "template_failed"))}`);
  }
  revalidatePath("/conversas");
  redirect(`/conversas?conversation=${encodeURIComponent(id)}`);
}
