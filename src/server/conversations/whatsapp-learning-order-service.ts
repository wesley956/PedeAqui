import "server-only";

import {
  isWhatsAppOrderStep,
  looksLikeWhatsAppOrderItems,
  WhatsAppOrderService as BaseWhatsAppOrderService,
  whatsappOrderStartMessage,
  type WhatsAppOrderContext,
  type WhatsAppOrderHandleResult,
  type WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-order-service";
import {
  classifyOrderLearningOutcome,
  sanitizeLearningPhrase,
  WhatsAppLanguageLearningService,
} from "@/server/conversations/whatsapp-language-learning";

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof BaseWhatsAppOrderService.handle>[0];
type ContextWithLearning = WhatsAppOrderContext & { learningPendingPhrase?: string };

function pendingLearningPhrase(context: unknown) {
  if (!context || typeof context !== "object") return null;
  const value = (context as Record<string, unknown>).learningPendingPhrase;
  return typeof value === "string" ? value : null;
}

function hasPendingOrderDecision(context: unknown) {
  if (!context || typeof context !== "object") return false;
  const raw = context as Record<string, unknown>;
  return Boolean(raw.pendingChoices || raw.pendingComposition);
}

function withPendingLearning(result: WhatsAppOrderHandleResult, phrase: string | null): WhatsAppOrderHandleResult {
  if (!phrase || !result.context) return result;
  return {
    ...result,
    context: { ...result.context, learningPendingPhrase: phrase } as ContextWithLearning,
  };
}

function fallbackQuantity(text: string) {
  const match = text.trim().match(/^(\d{1,2})\b/);
  const quantity = match ? Number(match[1]) : 1;
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : 1;
}

export class WhatsAppOrderService {
  static async handle(input: OrderInput): Promise<WhatsAppOrderHandleResult> {
    const previousPending = pendingLearningPhrase(input.context);
    let result = await BaseWhatsAppOrderService.handle(input);
    let outcome = classifyOrderLearningOutcome(result.body);

    if (
      input.step === "order_items" &&
      outcome === "unresolved" &&
      !hasPendingOrderDecision(input.context)
    ) {
      const alias = await WhatsAppLanguageLearningService.findLearnedProductAlias({
        organizationId: input.organizationId,
        storeId: input.storeId,
        phrase: input.text,
      });
      if (alias) {
        const retry = await BaseWhatsAppOrderService.handle({
          ...input,
          text: `${fallbackQuantity(input.text)} ${alias}`,
        });
        if (classifyOrderLearningOutcome(retry.body) === "resolved") {
          result = retry;
          outcome = "resolved";
        }
      }
    }

    if (input.step === "order_items") {
      await WhatsAppLanguageLearningService.recordOutcome({
        organizationId: input.organizationId,
        storeId: input.storeId,
        phrase: input.text,
        body: result.body,
      });

      if (previousPending && outcome === "resolved") {
        await WhatsAppLanguageLearningService.recordCorrection({
          organizationId: input.organizationId,
          storeId: input.storeId,
          originalPhrase: previousPending,
          resolvedBody: result.body,
        });
      }

      if (outcome === "unresolved") {
        return withPendingLearning(result, sanitizeLearningPhrase(input.text));
      }
    }

    return result;
  }
}
