import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { contextualOrderQuestion } from "@/server/conversations/whatsapp-contextual-question-core";
import type {
  WhatsAppOrderContext,
  WhatsAppOrderHandleResult,
  WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-learning-order-service";

type ContextualInput = {
  organizationId: string;
  storeId: string;
  text: string;
  step: WhatsAppOrderStep;
  context: unknown;
};

type PendingComposition = {
  name?: string;
  groupId?: string;
  groupName?: string;
  distributionTotal?: number;
};

function pendingComposition(context: unknown): PendingComposition | null {
  if (!context || typeof context !== "object") return null;
  const value = (context as Record<string, unknown>).pendingComposition;
  return value && typeof value === "object" ? value as PendingComposition : null;
}

export async function answerContextualOrderQuestion(input: ContextualInput): Promise<WhatsAppOrderHandleResult | null> {
  if (input.step !== "order_items") return null;
  const question = contextualOrderQuestion(input.text);
  if (!question) return null;

  const pending = pendingComposition(input.context);
  if (!pending?.groupId) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("modifiers")
    .select("name")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("modifier_group_id", pending.groupId)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;

  const names = (data ?? [])
    .map((item) => typeof item.name === "string" ? item.name.trim() : "")
    .filter(Boolean);
  if (names.length === 0) return null;

  const product = pending.name?.trim() || "esse item";
  const context = input.context as WhatsAppOrderContext;
  const resume = pending.distributionTotal
    ? `Depois me diga como quer distribuir as ${pending.distributionTotal} unidades.`
    : "Depois me diga quais opções você quer.";

  if (question.type === "list_flavors") {
    return {
      handled: true,
      body: `Claro 😊 Para ${product}, os sabores disponíveis agora são:\n${names.map((name) => `• ${name}`).join("\n")}\n\n${resume}`,
      nextStep: "order_items",
      context,
    };
  }

  const query = normalizeBotInput(question.query);
  const match = names.find((name) => {
    const normalized = normalizeBotInput(name);
    return normalized === query || normalized.includes(query) || query.includes(normalized);
  });

  return {
    handled: true,
    body: match
      ? `Sim 😊 ${match} está disponível para ${product}.\n\n${resume}`
      : `Não encontrei “${question.query}” entre os sabores disponíveis de ${product}. Hoje tenho:\n${names.map((name) => `• ${name}`).join("\n")}\n\n${resume}`,
    nextStep: "order_items",
    context,
  };
}
