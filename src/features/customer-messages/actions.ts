"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { CustomerPanelMessageService } from "@/server/platform/customer-panel-message-service";

export async function markCustomerPanelMessageReadAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const messageId = String(formData.get("messageId") ?? "").trim();
  if (!messageId) throw new Error("Mensagem inválida.");

  await CustomerPanelMessageService.markRead(messageId, user.id);
  revalidatePath("/", "layout");
}
