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
import { asksAboutPixPayment, pixPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof EnhancedWhatsAppOrderService.handle>[0];

export class WhatsAppOrderService {
  static async handle(input: OrderInput): Promise<WhatsAppOrderHandleResult> {
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

    return EnhancedWhatsAppOrderService.handle(input);
  }
}
