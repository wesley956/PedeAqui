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
import { answerActiveOrderSideIntent } from "@/server/conversations/whatsapp-active-order-side-intent";
import {
  asksAboutSavedAddress,
  formatSavedAddress,
  loadWhatsAppSavedAddresses,
  quantityOnlyRequest,
} from "@/server/conversations/whatsapp-customer-context";
import {
  addressPartsFromMessage,
  addressProgressPrompt,
  clearPendingAddressParts,
  clearPendingOrderQuantity,
  hasSavedAddressChoices,
  pendingAddressParts,
  pendingOrderQuantity,
  rememberAddressParts,
  rememberOrderQuantity,
} from "@/server/conversations/whatsapp-order-memory";

export { isWhatsAppOrderStep, looksLikeWhatsAppOrderItems, whatsappOrderStartMessage };
export type { WhatsAppOrderContext, WhatsAppOrderHandleResult, WhatsAppOrderStep };

type OrderInput = Parameters<typeof EnhancedWhatsAppOrderService.handle>[0];

function preservedContext(input: OrderInput): WhatsAppOrderContext {
  return input.context && typeof input.context === "object"
    ? input.context as WhatsAppOrderContext
    : { channel: "whatsapp_order", version: 1 };
}

function shouldStartFragmentedAddress(parts: string[]) {
  return parts.length > 0 && /[a-zA-ZÀ-ÿ]/.test(parts[0]!);
}

function unresolvedQuantityResult(result: WhatsAppOrderHandleResult) {
  if (result.nextStep !== "order_items" || !result.context) return false;
  const context = result.context as Record<string, unknown>;
  return !context.cartToken && !context.pendingChoices && !context.pendingComposition;
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

    const sideIntentAnswer = await answerActiveOrderSideIntent(input);
    if (sideIntentAnswer) return sideIntentAnswer;

    const contextualAnswer = await answerContextualOrderQuestion(input);
    if (contextualAnswer) return contextualAnswer;

    if (input.step === "order_address") {
      const currentParts = pendingAddressParts(input.context);
      const incomingParts = addressPartsFromMessage(input.text);

      if (incomingParts.length >= 5) {
        return EnhancedWhatsAppOrderService.handle({
          ...input,
          text: incomingParts.join(", "),
          context: clearPendingAddressParts(input.context),
        });
      }

      const canAccumulate = !hasSavedAddressChoices(input.context)
        && (currentParts.length > 0 || shouldStartFragmentedAddress(incomingParts));
      if (canAccumulate) {
        const combined = [...currentParts, ...incomingParts].slice(0, 6);
        if (combined.length < 5) {
          return {
            handled: true,
            body: addressProgressPrompt(combined.length),
            nextStep: "order_address",
            context: rememberAddressParts(input.context, combined) as WhatsAppOrderContext,
          };
        }

        return EnhancedWhatsAppOrderService.handle({
          ...input,
          text: combined.join(", "),
          context: clearPendingAddressParts(input.context),
        });
      }
    }

    if (input.step === "order_items") {
      const quantity = quantityOnlyRequest(input.text);
      if (quantity !== null) {
        return {
          handled: true,
          body: `Entendi ${quantity} unidades 😊 Agora me diga de qual produto do cardápio desta loja.`,
          nextStep: "order_items",
          context: rememberOrderQuantity(input.context, quantity) as WhatsAppOrderContext,
        };
      }
    }

    const rememberedQuantity = input.step === "order_items" ? pendingOrderQuantity(input.context) : null;
    const hasExplicitQuantity = rememberedQuantity !== null && looksLikeWhatsAppOrderItems(input.text);
    const effectiveText = rememberedQuantity !== null && !hasExplicitQuantity
      ? `${rememberedQuantity} ${input.text}`
      : input.text;
    const contextWithoutRememberedQuantity = rememberedQuantity !== null
      ? clearPendingOrderQuantity(input.context)
      : input.context;
    const repairedContext = repairSuspiciousPackageQuantity(contextWithoutRememberedQuantity, effectiveText);
    const result = await EnhancedWhatsAppOrderService.handle({ ...input, text: effectiveText, context: repairedContext });

    if (rememberedQuantity !== null && !hasExplicitQuantity && unresolvedQuantityResult(result)) {
      return {
        ...result,
        context: rememberOrderQuantity(result.context, rememberedQuantity) as WhatsAppOrderContext,
      };
    }

    return result;
  }
}
