import "server-only";

import {
  isWhatsAppOrderStep,
  looksLikeWhatsAppOrderItems,
  WhatsAppOrderService as EnhancedWhatsAppOrderService,
  whatsappOrderStartMessage,
  type WhatsAppOrderContext,
  type WhatsAppOrderHandleResult,
  type WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-learning-order-service";
import {
  isOrderEditRequest,
  repairSuspiciousPackageQuantity,
  restartOrderMessage,
} from "@/server/conversations/whatsapp-order-corrections";
import { answerContextualOrderQuestion } from "@/server/conversations/whatsapp-contextual-question-service";
import { asksAboutPixPayment, pixPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof EnhancedWhatsAppOrderService.handle>[0];

export class WhatsAppOrderService {
  static async handle(input: OrderInput): Promise<WhatsAppOrderHandleResult> {
    if (isOrderEditRequest(input.text)) {
      return {
        handled: true,
        body: restartOrderMessage(),
        nextStep: "order_items",
        context: { channel: "whatsapp_order", version: 1 },
      };
    }

    const contextualAnswer = await answerContextualOrderQuestion(input);
    if (contextualAnswer) return contextualAnswer;

    if (input.step === "order_payment" && asksAboutPixPayment(input.text)) {
      return {
        handled: true,
        body: pixPaymentGuidanceMessage(),
        nextStep: "order_payment",
        context: input.context && typeof input.context === "object"
          ? input.context as WhatsAppOrderContext
          : { channel: "whatsapp_order", version: 1 },
      };
    }

    const repairedContext = repairSuspiciousPackageQuantity(input.context, input.text);
    return EnhancedWhatsAppOrderService.handle({ ...input, context: repairedContext });
  }
}
