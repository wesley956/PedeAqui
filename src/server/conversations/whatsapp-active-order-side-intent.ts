import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildOrderLookupMessage,
  phonesBelongToSameCustomer,
  priceProductQueryFromInput,
  resolveWhatsAppBotIntent,
} from "@/server/conversations/bot-menu";
import {
  activeOrderTrackingCodeFromInput,
  isActiveOrderTrackingQuestion,
} from "@/server/conversations/whatsapp-active-order-side-intent-core";
import {
  asksForMenuDescription,
  catalogAvailabilityQueryFromInput,
  explicitCatalogItemRequest,
} from "@/server/conversations/whatsapp-catalog-intent-core";
import {
  buildWhatsAppCatalogAvailability,
  buildWhatsAppCatalogPrice,
  buildWhatsAppMenuSummary,
  buildWhatsAppModifierPlacement,
} from "@/server/conversations/whatsapp-catalog-conversation-service";
import { buildPublicMenuUrl } from "@/server/conversations/greeting";
import { visibleWorkflowStage } from "@/server/conversations/order-workflow-visibility";
import { loadRecentOwnedOrderNumbers } from "@/server/conversations/whatsapp-customer-context";
import {
  asksAboutPixPayment,
  canonicalPaymentGuidanceMessage,
} from "@/server/conversations/whatsapp-payment-guidance";
import { resolveWhatsAppPaymentSelection } from "@/server/conversations/whatsapp-payment-methods";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import { officialPublicAppOrigin } from "@/server/public-app-url";
import type {
  WhatsAppOrderContext,
  WhatsAppOrderHandleResult,
  WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-learning-order-service";

type SideIntentInput = {
  organizationId: string;
  storeId: string;
  storeSlug: string;
  contactPhone: string;
  text: string;
  step: WhatsAppOrderStep;
  context: unknown;
};

function preservedContext(input: SideIntentInput, clearPendingChoices = false): WhatsAppOrderContext {
  const current = input.context && typeof input.context === "object"
    ? input.context as WhatsAppOrderContext
    : { channel: "whatsapp_order", version: 1 };
  if (!clearPendingChoices) return current;
  return { ...current, pendingChoices: undefined };
}

function hasPendingComposition(context: unknown) {
  return Boolean(context && typeof context === "object" && (context as Record<string, unknown>).pendingComposition);
}

function resumeSuffix() {
  return "\n\nSeu pedido em montagem continua salvo exatamente de onde estava.";
}

function menuUrl(storeSlug: string) {
  return buildPublicMenuUrl(process.env.APP_URL ?? officialPublicAppOrigin(), storeSlug);
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
  const paymentIntent = resolveWhatsAppBotIntent(input.text, "menu") === "payment";
  if (paymentIntent || asksAboutPixPayment(input.text)) {
    const options = await StorePaymentMethodService.listForStore(input.organizationId, input.storeId);
    const selection = resolveWhatsAppPaymentSelection(input.text, options);
    if (input.step === "order_payment" && selection) return null;
    return {
      handled: true,
      body: `${canonicalPaymentGuidanceMessage(options, input.text)}${resumeSuffix()}`,
      nextStep: input.step,
      context: preservedContext(input),
    };
  }

  const catalogInput = {
    organizationId: input.organizationId,
    storeId: input.storeId,
    storeSlug: input.storeSlug,
  };
  const publicMenuUrl = menuUrl(input.storeSlug);

  if (asksForMenuDescription(input.text)) {
    return {
      handled: true,
      body: `${await buildWhatsAppMenuSummary(catalogInput, publicMenuUrl)}${resumeSuffix()}`,
      nextStep: input.step,
      context: preservedContext(input, true),
    };
  }

  const availabilityQuery = catalogAvailabilityQueryFromInput(input.text);
  if (availabilityQuery) {
    return {
      handled: true,
      body: `${await buildWhatsAppCatalogAvailability(catalogInput, availabilityQuery, publicMenuUrl)}${resumeSuffix()}`,
      nextStep: input.step,
      context: preservedContext(input, true),
    };
  }

  const priceQuery = priceProductQueryFromInput(input.text);
  if (priceQuery) {
    return {
      handled: true,
      body: `${await buildWhatsAppCatalogPrice(catalogInput, priceQuery, publicMenuUrl)}${resumeSuffix()}`,
      nextStep: input.step,
      context: preservedContext(input, true),
    };
  }

  if (resolveWhatsAppBotIntent(input.text, "menu") === "menu_link") {
    return {
      handled: true,
      body: `Aqui está o cardápio oficial da loja: ${publicMenuUrl}${resumeSuffix()}`,
      nextStep: input.step,
      context: preservedContext(input, true),
    };
  }

  if (!hasPendingComposition(input.context)) {
    const explicitItem = explicitCatalogItemRequest(input.text);
    if (explicitItem) {
      const placement = await buildWhatsAppModifierPlacement(catalogInput, explicitItem.query);
      if (placement) {
        return {
          handled: true,
          body: `${placement}${resumeSuffix()}`,
          nextStep: input.step,
          context: preservedContext(input, true),
        };
      }
    }
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
