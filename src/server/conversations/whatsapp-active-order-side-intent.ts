import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildOrderLookupMessage,
  normalizeBotInput,
  phonesBelongToSameCustomer,
  trackingCodeFromInput,
} from "@/server/conversations/bot-menu";
import { visibleWorkflowStage } from "@/server/conversations/order-workflow-visibility";
import { loadRecentOwnedOrderNumbers } from "@/server/conversations/whatsapp-customer-context";
import { asksAboutPixPayment, pixPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";
import type {
  WhatsAppOrderContext,
  WhatsAppOrderHandleResult,
  WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-learning-order-service";

type SideIntentInput = {
  organizationId: string;
  storeId: string;
  contactPhone: string;
  text: string;
  step: WhatsAppOrderStep;
  context: unknown;
};

function preservedContext(input: SideIntentInput): WhatsAppOrderContext {
  return input.context && typeof input.context === "object"
    ? input.context as WhatsAppOrderContext
    : { channel: "whatsapp_order", version: 1 };
}

export function isActiveOrderTrackingQuestion(text: string) {
  const normalized = normalizeBotInput(text);
  if (!normalized) return false;
  return normalized === "meu pedido"
    || normalized === "acompanhar pedido"
    || normalized === "status do pedido"
    || normalized.includes("onde esta meu pedido")
    || normalized.includes("como esta meu pedido")
    || normalized.includes("meu pedido ja saiu")
    || normalized.includes("acompanhar meu pedido");
}

export function activeOrderTrackingCodeFromInput(text: string) {
  const normalized = normalizeBotInput(text);
  if (!/\b(?:pedido|codigo)\b/.test(normalized)) return null;
  return trackingCodeFromInput(text);
}

function resumeSuffix() {
  return "\n\nSeu pedido em montagem continua salvo exatamente de onde estava.";
}

function trackingChoiceMessage(orderNumbers: number[]) {
  if (!orderNumbers.length) {
    return `Não encontrei um pedido recente vinculado com segurança a este WhatsApp. Se você tiver o número, envie algo como “pedido 70”.${resumeSuffix()}`;
  }
  const list = orderNumbers.map((number) => `#${number}`).join(orderNumbers.length > 1 ? ", " : "");
  return `Encontrei ${orderNumbers.length === 1 ? "este pedido recente" : "estes pedidos recentes"} vinculado${orderNumbers.length === 1 ? "" : "s"} ao seu WhatsApp: ${list}. Para consultar sem misturar com o pedido novo, envie “pedido ${orderNumbers[0]}”.${resumeSuffix()}`;
}

async function trackingCodeReply(input: SideIntentInput, displayNumber: number) {
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("orders")
    .select("display_number, customer_phone_snapshot, fulfillment_type, order_status, production_status, fulfillment_status")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("display_number", displayNumber)
    .maybeSingle();
  if (orderError) throw orderError;

  if (!order || !phonesBelongToSameCustomer(input.contactPhone, order.customer_phone_snapshot)) {
    return `Não encontrei o pedido #${displayNumber} ligado com segurança a este WhatsApp. Confira o número ou peça atendimento.${resumeSuffix()}`;
  }

  const { data: workflowSettings, error: workflowError } = await admin.from("store_operational_settings")
    .select("orders_workflow_mode, orders_custom_workflow")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .maybeSingle();
  if (workflowError) throw workflowError;

  const status = buildOrderLookupMessage({
    displayNumber: Number(order.display_number),
    orderStatus: order.order_status,
    productionStatus: order.production_status,
    fulfillmentStatus: order.fulfillment_status,
    visibleStage: visibleWorkflowStage({
      fulfillmentType: order.fulfillment_type,
      orderStatus: order.order_status,
      productionStatus: order.production_status,
      fulfillmentStatus: order.fulfillment_status,
    }, workflowSettings ?? {}),
  });
  return `${status}${resumeSuffix()}`;
}

export async function answerActiveOrderSideIntent(input: SideIntentInput): Promise<WhatsAppOrderHandleResult | null> {
  if (asksAboutPixPayment(input.text)) {
    return {
      handled: true,
      body: `${pixPaymentGuidanceMessage()}${resumeSuffix()}`,
      nextStep: input.step,
      context: preservedContext(input),
    };
  }

  const trackingCode = activeOrderTrackingCodeFromInput(input.text);
  if (trackingCode !== null) {
    return {
      handled: true,
      body: await trackingCodeReply(input, trackingCode),
      nextStep: input.step,
      context: preservedContext(input),
    };
  }

  if (!isActiveOrderTrackingQuestion(input.text)) return null;

  const orderNumbers = await loadRecentOwnedOrderNumbers({
    organizationId: input.organizationId,
    storeId: input.storeId,
    contactPhone: input.contactPhone,
    limit: 3,
  });
  return {
    handled: true,
    body: trackingChoiceMessage(orderNumbers),
    nextStep: input.step,
    context: preservedContext(input),
  };
}
