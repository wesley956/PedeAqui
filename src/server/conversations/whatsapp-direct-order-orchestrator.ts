import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildCustomerBenefitsMessage,
  buildWhatsAppBotMenu,
  isGrowthBenefitIntent,
  normalizeBotInput,
  priceProductQueryFromInput,
  resolveWhatsAppBotIntent,
} from "@/server/conversations/bot-menu";
import {
  asksForMenuDescription,
  catalogAvailabilityQueryFromInput,
} from "@/server/conversations/whatsapp-catalog-intent-core";
import { buildPublicMenuUrl } from "@/server/conversations/greeting";
import { loadCustomerBenefits } from "@/server/growth/customer-benefits";
import {
  StoreOperationalStatusService,
  storeClosedOrderMessage,
  storeOperationalHoursMessage,
} from "@/server/menu/store-operational-status";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import {
  asksAboutSavedAddress,
  asksForTrackingNumberHelp,
  formatSavedAddress,
  loadRecentOwnedOrderNumbers,
  loadWhatsAppSavedAddresses,
} from "@/server/conversations/whatsapp-customer-context";
import {
  isWhatsAppOrderStep,
  looksLikeWhatsAppOrderItems,
  WhatsAppOrderService,
  whatsappOrderStartMessage,
  type WhatsAppOrderContext,
  type WhatsAppOrderStep,
} from "@/server/conversations/whatsapp-smart-order-service";
import { isExplicitMenuNavigation } from "@/server/conversations/whatsapp-navigation";
import { recordFailure } from "@/server/observability/failure";
import type { LegacyIntelligenceDecision, LegacyIntelligenceObserver } from "@/server/conversations/legacy-intelligence-observation";

type IngestResult = {
  conversation_id?: string;
  message_id?: string;
  message_created?: boolean;
};

type ClaimedOutbound = {
  claimed?: boolean;
  message_id?: string;
};

const DEFAULT_ORDER_SESSION_TTL_MINUTES = 45;
const HUMAN_HANDOFF_ORDER_SESSION_TTL_MINUTES = 12 * 60;

async function sendBotText(input: {
  requestId: string;
  conversationId: string;
  organizationId: string;
  storeId: string;
  phoneNumberId: string;
  accessTokenSecretRef: string;
  recipient: string;
  body: string;
  clientMessageId: string;
}) {
  const admin = createAdminClient();
  const { data: claim, error: claimError } = await admin.rpc("conversation_claim_bot_outbound_internal", {
    p_conversation_id: input.conversationId,
    p_body: input.body,
    p_client_message_id: input.clientMessageId,
  });
  if (claimError) throw claimError;
  const claimed = claim as ClaimedOutbound | null;
  if (!claimed?.claimed || !claimed.message_id) return "duplicate" as const;

  try {
    const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(input.accessTokenSecretRef));
    const sent = await provider.sendText({ phoneNumberId: input.phoneNumberId, recipient: input.recipient, body: input.body });
    const { error } = await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimed.message_id,
      p_external_message_id: sent.externalMessageId,
      p_status: "sent",
      p_error_code: null,
      p_error_message: null,
    });
    if (error) throw error;
    return "sent" as const;
  } catch (error) {
    recordFailure("whatsapp.order_bot.send_failed", error, {
      requestId: input.requestId,
      organizationId: input.organizationId,
      storeId: input.storeId,
    });
    await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimed.message_id,
      p_external_message_id: null,
      p_status: "failed",
      p_error_code: "provider_error",
      p_error_message: safeWhatsAppFailureMessage(error),
    });
    await admin.rpc("conversation_transition_internal", {
      p_conversation_id: input.conversationId,
      p_target_state: "waiting_agent",
      p_assigned_user_id: null,
      p_reason: "Falha no envio automático durante pedido pelo WhatsApp",
      p_actor_user_id: null,
      p_source: "bot",
    });
    return "failed" as const;
  }
}

async function saveSession(
  conversationId: string,
  step: WhatsAppOrderStep | "menu" | "awaiting_tracking_code",
  messageId: string,
  context: WhatsAppOrderContext | null,
  ttlMinutes = DEFAULT_ORDER_SESSION_TTL_MINUTES,
) {
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const { error } = await admin.rpc("automation_session_upsert_internal", {
    p_conversation_id: conversationId,
    p_step: step,
    p_context: context ?? { channel: "whatsapp_menu", version: 3 },
    p_last_input_message_id: messageId,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
}

function wantsHuman(text: string) {
  const normalized = normalizeBotInput(text);
  return normalized === "3" || normalized.includes("atendente") || normalized.includes("humano") || normalized.includes("falar com restaurante");
}

function activeOrderObservation(text: string): LegacyIntelligenceDecision {
  if (asksForMenuDescription(text)) return { intent: "menu_summary", tool: "catalog" };
  if (catalogAvailabilityQueryFromInput(text)) return { intent: "catalog_availability", tool: "catalog" };
  if (priceProductQueryFromInput(text)) return { intent: "price", tool: "catalog" };
  const intent = resolveWhatsAppBotIntent(text, "menu");
  if (intent === "menu_link") return { intent, tool: "catalog" };
  if (intent === "payment") return { intent, tool: "conversation_info" };
  return { intent: "order_continue", tool: "whatsapp_order" };
}

function savedAddressReply(addresses: Awaited<ReturnType<typeof loadWhatsAppSavedAddresses>>) {
  if (!addresses.length) {
    return "Ainda não encontrei um endereço salvo vinculado a este WhatsApp com segurança. Quando você escolher entrega, poderá informar um endereço normalmente.";
  }
  return `Sim 😊 Encontrei ${addresses.length === 1 ? "este endereço" : "estes endereços"} vinculado${addresses.length === 1 ? "" : "s"} ao seu WhatsApp:\n${addresses.map((address, index) => `${index + 1} — ${formatSavedAddress(address)}`).join("\n")}`;
}

function trackingRecoveryReply(orderNumbers: number[], activeOrderStep: WhatsAppOrderStep | null) {
  if (!orderNumbers.length) {
    return "Não encontrei um pedido recente vinculado com segurança a este WhatsApp. Se você tiver o número do pedido, envie algo como “pedido 70”. Se não tiver, posso encaminhar para atendimento.";
  }
  const list = orderNumbers.map((number) => `#${number}`).join(orderNumbers.length > 1 ? ", " : "");
  if (activeOrderStep) {
    return `Encontrei ${orderNumbers.length === 1 ? "um pedido recente" : "pedidos recentes"} vinculado${orderNumbers.length === 1 ? "" : "s"} a este WhatsApp: ${list}.\n\nSua montagem atual continua aberta. Para consultar um pedido anterior sem misturar com a quantidade do pedido novo, envie “pedido ${orderNumbers[0]}”.`;
  }
  return orderNumbers.length === 1
    ? `Encontrei um pedido recente vinculado com segurança a este WhatsApp: #${orderNumbers[0]}. Se for esse, responda apenas ${orderNumbers[0]} para acompanhar.`
    : `Encontrei estes pedidos recentes vinculados com segurança a este WhatsApp: ${list}. Responda com o número do pedido que deseja acompanhar.`;
}

export class WhatsAppDirectOrderOrchestrator {
  static async afterInbound(result: unknown, requestId: string, observe?: LegacyIntelligenceObserver): Promise<boolean> {
    const ingest = result && typeof result === "object" ? result as IngestResult : null;
    if (!ingest?.conversation_id || !ingest.message_id || ingest.message_created === false) return false;

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, organization_id, store_id, contact_id, channel, status")
      .eq("id", ingest.conversation_id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation || conversation.channel !== "whatsapp" || conversation.status !== "bot") return false;

    const [settingsResult, contactResult, storeResult, inboundResult, sessionResult] = await Promise.all([
      admin.from("store_conversation_settings")
        .select("whatsapp_orders_enabled, whatsapp_enabled, whatsapp_phone_number_id, access_token_secret_ref, default_bot_enabled, bot_display_name, handoff_message")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .maybeSingle(),
      admin.from("contacts")
        .select("external_id, phone_normalized, name, customer_id")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("id", conversation.contact_id)
        .maybeSingle(),
      admin.from("stores")
        .select("name, slug, status, timezone")
        .eq("organization_id", conversation.organization_id)
        .eq("id", conversation.store_id)
        .maybeSingle(),
      admin.from("messages")
        .select("body, content_type")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .eq("id", ingest.message_id)
        .maybeSingle(),
      admin.from("automation_sessions")
        .select("step, state, context, expires_at")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .maybeSingle(),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (contactResult.error) throw contactResult.error;
    if (storeResult.error) throw storeResult.error;
    if (inboundResult.error) throw inboundResult.error;
    if (sessionResult.error) throw sessionResult.error;

    const settings = settingsResult.data;
    const contact = contactResult.data;
    const store = storeResult.data;
    const inbound = inboundResult.data;
    const session = sessionResult.data;
    if (!settings?.whatsapp_orders_enabled || !settings.default_bot_enabled || !settings.whatsapp_enabled) return false;
    if (!settings.whatsapp_phone_number_id || !settings.access_token_secret_ref || !contact?.external_id || !store?.slug || !store.name) return false;
    if (!inbound || (inbound.content_type !== "text" && inbound.content_type !== "interactive")) return false;

    const active = session?.state === "active" && (!session.expires_at || Date.parse(session.expires_at) > Date.now());
    const activeOrderStep = active && isWhatsAppOrderStep(session?.step) ? session.step : null;
    const intent = resolveWhatsAppBotIntent(inbound.body, "menu");
    const naturalOrder = looksLikeWhatsAppOrderItems(inbound.body);
    const savedAddressQuestion = asksAboutSavedAddress(inbound.body);
    const trackingNumberHelp = asksForTrackingNumberHelp(inbound.body);
    if (!activeOrderStep && intent !== "order_start" && !naturalOrder && !savedAddressQuestion && !trackingNumberHelp) return false;

    const sendBase = {
      requestId,
      conversationId: conversation.id,
      organizationId: conversation.organization_id,
      storeId: conversation.store_id,
      phoneNumberId: settings.whatsapp_phone_number_id,
      accessTokenSecretRef: settings.access_token_secret_ref,
      recipient: contact.external_id,
    };
    let operationalStatusPromise: ReturnType<typeof StoreOperationalStatusService.load> | null = null;
    const loadOperationalStatus = () => {
      operationalStatusPromise ??= StoreOperationalStatusService.load({
        organizationId: conversation.organization_id,
        storeId: conversation.store_id,
      });
      return operationalStatusPromise;
    };

    if (savedAddressQuestion) {
      let body: string;
      try {
        const addresses = await loadWhatsAppSavedAddresses({
          organizationId: conversation.organization_id,
          storeId: conversation.store_id,
          contactPhone: contact.phone_normalized ?? contact.external_id,
          customerId: contact.customer_id,
        });
        body = savedAddressReply(addresses);
      } catch (error) {
        recordFailure("whatsapp.customer_context.saved_address_failed", error, {
          requestId,
          organizationId: conversation.organization_id,
          storeId: conversation.store_id,
        });
        body = "Não consegui consultar seus endereços agora sem arriscar mostrar um cadastro incorreto. Você pode continuar normalmente e informar o endereço quando escolher entrega.";
      }
      if (activeOrderStep) body += "\n\nSeu pedido continua exatamente de onde estava.";
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-context:address:${ingest.message_id}` });
      await saveSession(
        conversation.id,
        activeOrderStep ?? "menu",
        ingest.message_id,
        activeOrderStep ? session?.context as WhatsAppOrderContext : null,
      );
      observe?.({ intent: "customer_context", tool: "conversation_info" });
      return true;
    }

    if (trackingNumberHelp) {
      let orderNumbers: number[] = [];
      try {
        orderNumbers = await loadRecentOwnedOrderNumbers({
          organizationId: conversation.organization_id,
          storeId: conversation.store_id,
          contactPhone: contact.phone_normalized ?? contact.external_id,
          limit: 3,
        });
      } catch (error) {
        recordFailure("whatsapp.customer_context.tracking_recovery_failed", error, {
          requestId,
          organizationId: conversation.organization_id,
          storeId: conversation.store_id,
        });
      }
      const body = trackingRecoveryReply(orderNumbers, activeOrderStep);
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-context:tracking:${ingest.message_id}` });
      await saveSession(
        conversation.id,
        activeOrderStep ?? (orderNumbers.length ? "awaiting_tracking_code" : "menu"),
        ingest.message_id,
        activeOrderStep ? session?.context as WhatsAppOrderContext : null,
      );
      observe?.({ intent: "track_start", tool: "order_tracking" });
      return true;
    }

    if (activeOrderStep && intent === "hours") {
      const operational = await loadOperationalStatus();
      const body = `${storeOperationalHoursMessage(operational)}\n\nSua montagem atual continua salva.`;
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:hours:${ingest.message_id}` });
      await saveSession(conversation.id, activeOrderStep, ingest.message_id, session?.context as WhatsAppOrderContext);
      observe?.({ intent: "hours", tool: "conversation_info" });
      return true;
    }

    if (activeOrderStep && isExplicitMenuNavigation(inbound.body)) {
      const body = buildWhatsAppBotMenu(store.name, true, settings.bot_display_name);
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:menu:${ingest.message_id}` });
      await saveSession(conversation.id, "menu", ingest.message_id, null);
      observe?.({ intent: "menu", tool: "conversation_info" });
      return true;
    }

    if (activeOrderStep && (wantsHuman(inbound.body) || intent === "benefit_handoff")) {
      await sendBotText({
        ...sendBase,
        body: `Vou pausar a automação para o atendimento humano, mas mantive a montagem do seu pedido salva. ${settings.handoff_message}`,
        clientMessageId: `auto:wa-order:handoff:${ingest.message_id}`,
      });
      await saveSession(
        conversation.id,
        activeOrderStep,
        ingest.message_id,
        session?.context as WhatsAppOrderContext,
        HUMAN_HANDOFF_ORDER_SESSION_TTL_MINUTES,
      );
      await admin.rpc("conversation_transition_internal", {
        p_conversation_id: conversation.id,
        p_target_state: "waiting_agent",
        p_assigned_user_id: null,
        p_reason: intent === "benefit_handoff" ? "Cliente contestou saldo ou benefício durante pedido pelo WhatsApp" : "Cliente pediu atendimento humano durante pedido pelo WhatsApp",
        p_actor_user_id: null,
        p_source: "bot",
      });
      observe?.({ intent, tool: "human_handoff" });
      return true;
    }

    if (activeOrderStep && isGrowthBenefitIntent(intent)) {
      const menuUrl = process.env.APP_URL ? buildPublicMenuUrl(process.env.APP_URL, store.slug) : "o cardápio da loja";
      const benefits = await loadCustomerBenefits({
        organizationId: conversation.organization_id,
        storeId: conversation.store_id,
        customerId: contact.customer_id,
        contactId: conversation.contact_id,
        timeZone: store.timezone || "America/Sao_Paulo",
        channel: "whatsapp",
      });
      const body = `${buildCustomerBenefitsMessage(intent, benefits, menuUrl)}\n\nNão apliquei nem consumi nada no pedido por aqui. Sua montagem continua aberta; pode seguir enviando os itens ou escrever menu.`;
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:benefits:${ingest.message_id}` });
      await saveSession(conversation.id, activeOrderStep, ingest.message_id, session?.context as WhatsAppOrderContext);
      observe?.({ intent, tool: "growth_benefits" });
      return true;
    }

    const operational = await loadOperationalStatus();
    if (!operational.canOrder) {
      const preserved = activeOrderStep ? "\n\nSua montagem atual continua salva para você retomar quando a loja voltar a aceitar pedidos." : "";
      const body = `${storeClosedOrderMessage(operational)}${preserved}`;
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:closed:${ingest.message_id}` });
      await saveSession(
        conversation.id,
        activeOrderStep ?? "menu",
        ingest.message_id,
        activeOrderStep ? session?.context as WhatsAppOrderContext : null,
      );
      observe?.(activeOrderStep ? { intent: "order_continue", tool: "whatsapp_order" } : { intent: "order_start", tool: "whatsapp_order" });
      return true;
    }

    if (!activeOrderStep && intent === "order_start" && !naturalOrder) {
      const body = whatsappOrderStartMessage(store.name);
      await sendBotText({ ...sendBase, body, clientMessageId: `auto:wa-order:start:${ingest.message_id}` });
      await saveSession(conversation.id, "order_items", ingest.message_id, { channel: "whatsapp_order", version: 1 });
      observe?.({ intent: "order_start", tool: "whatsapp_order" });
      return true;
    }

    const handled = await WhatsAppOrderService.handle({
      organizationId: conversation.organization_id,
      storeId: conversation.store_id,
      storeSlug: store.slug,
      storeName: store.name,
      contactName: contact.name,
      contactPhone: contact.phone_normalized ?? contact.external_id,
      text: inbound.body,
      step: activeOrderStep ?? "order_items",
      context: activeOrderStep ? session?.context : { channel: "whatsapp_order", version: 1 },
    });
    await sendBotText({ ...sendBase, body: handled.body, clientMessageId: `auto:wa-order:${ingest.message_id}` });
    await saveSession(conversation.id, handled.nextStep, ingest.message_id, handled.context);
    observe?.(activeOrderStep ? activeOrderObservation(inbound.body) : { intent: "order_start", tool: "whatsapp_order" });
    return true;
  }
}
