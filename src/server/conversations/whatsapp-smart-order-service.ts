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
import {
  asksAboutSavedAddress,
  formatSavedAddress,
  loadWhatsAppSavedAddresses,
  quantityOnlyRequest,
} from "@/server/conversations/whatsapp-customer-context";

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof EnhancedWhatsAppOrderService.handle>[0];

function preservedContext(input: OrderInput): WhatsAppOrderContext {
  return input.context && typeof input.context === "object"
    ? input.context as WhatsAppOrderContext
    : { channel: "whatsapp_order", version: 1 };
}

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

    if (asksAboutSavedAddress(input.text)) {
      try {
        const addresses = await loadWhatsAppSavedAddresses({
          organizationId: input.organizationId,
          storeId: input.storeId,
          contactPhone: input.contactPhone,
        });
        const body = addresses.length
          ? `Sim 😊 Encontrei ${addresses.length === 1 ? "este endereço" : "estes endereços"} vinculado${addresses.length === 1 ? "" : "s"} ao seu WhatsApp:\n${addresses.map((address, index) => `${index + 1} — ${formatSavedAddress(address)}`).join("\n")}\n\nSeu pedido continua exatamente de onde estava.`
          : "Ainda não encontrei um endereço salvo vinculado a este WhatsApp com segurança. Seu pedido continua exatamente de onde estava; quando chegar na etapa de entrega, você poderá informar o endereço.";
        return { handled: true, body, nextStep: input.step, context: preservedContext(input) };
      } catch {
        return {
          handled: true,
          body: "Não consegui consultar seus endereços agora sem arriscar mostrar um cadastro incorreto. Seu pedido continua de onde estava.",
          nextStep: input.step,
          context: preservedContext(input),
        };
      }
    }

    const contextualAnswer = await answerContextualOrderQuestion(input);
    if (contextualAnswer) return contextualAnswer;

    if (input.step === "order_payment" && asksAboutPixPayment(input.text)) {
      return {
        handled: true,
        body: pixPaymentGuidanceMessage(),
        nextStep: "order_payment",
        context: preservedContext(input),
      };
    }

    if (input.step === "order_items") {
      const quantity = quantityOnlyRequest(input.text);
      if (quantity !== null) {
        return {
          handled: true,
          body: `Entendi ${quantity} unidades 😊 Agora me diga de qual produto. Por exemplo: “${quantity} salgados” ou “${quantity} mini churros”.`,
          nextStep: "order_items",
          context: preservedContext(input),
        };
      }
    }

    const repairedContext = repairSuspiciousPackageQuantity(input.context, input.text);
    return EnhancedWhatsAppOrderService.handle({ ...input, context: repairedContext });
  }
}
