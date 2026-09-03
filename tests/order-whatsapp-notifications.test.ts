import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOrderNotificationBody,
  buildOrderNotificationTemplateParameters,
  buildOrderTrackingUrl,
  notificationClientMessageId,
  notificationEnabled,
  retryDelaySeconds,
} from "@/server/conversations/order-notification-model";
import {
  defaultOrderNotificationText,
  normalizeOrderNotificationCustomTemplates,
  renderOrderNotificationTextTemplate,
  validateOrderNotificationTextTemplate,
} from "@/server/conversations/order-notification-template";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const identity = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  storeId: "22222222-2222-4222-8222-222222222222",
  orderId: "33333333-3333-4333-8333-333333333333",
  authoritativeEventId: "44444444-4444-4444-8444-444444444444",
} as const;

describe("[329] order notification model", () => {
  it("requires the global switch and the specific notification switch", () => {
    expect(notificationEnabled({ order_notifications_enabled: false, notify_order_received: true }, "order_received")).toBe(false);
    expect(notificationEnabled({ order_notifications_enabled: true, notify_order_received: false }, "order_received")).toBe(false);
    expect(notificationEnabled({ order_notifications_enabled: true, notify_order_received: true }, "order_received")).toBe(true);
    expect(notificationEnabled({ order_notifications_enabled: true, notify_order_canceled: true }, "order_canceled")).toBe(true);
  });

  it("keys outbound idempotency by tenant, store, order, automation and authoritative event", () => {
    const first = notificationClientMessageId({ ...identity, type: "out_for_delivery" });
    expect(first).toBe(notificationClientMessageId({ ...identity, type: "out_for_delivery" }));
    expect(first.length).toBeLessThanOrEqual(180);
    expect(first).not.toBe(notificationClientMessageId({ ...identity, type: "delivered" }));
    expect(first).not.toBe(notificationClientMessageId({ ...identity, storeId: "55555555-5555-4555-8555-555555555555", type: "out_for_delivery" }));
    expect(first).not.toBe(notificationClientMessageId({ ...identity, organizationId: "66666666-6666-4666-8666-666666666666", type: "out_for_delivery" }));
    expect(first).not.toBe(notificationClientMessageId({ ...identity, authoritativeEventId: "77777777-7777-4777-8777-777777777777", type: "out_for_delivery" }));
    expect(first).toContain("order-wa:v2");
    expect(first).toContain(identity.authoritativeEventId.replaceAll("-", ""));
  });

  it("builds a one-time URL exchange path and useful customer messages", () => {
    const url = buildOrderTrackingUrl("https://app.pedeaqui.example", "loja-centro", "order-1", "secret-token-value");
    expect(url).toContain("/m/loja-centro/pedido/order-1/acesso");
    expect(url).toContain("t=secret-token-value");
    expect(buildOrderNotificationBody({ type: "order_received", storeName: "Cantina", displayNumber: 42, trackingUrl: url })).toContain("pedido #42");
    expect(buildOrderNotificationBody({ type: "pickup_ready", storeName: "Cantina", displayNumber: 42, trackingUrl: url })).toContain("pronto para retirada");
    expect(buildOrderNotificationBody({ type: "out_for_delivery", storeName: "Cantina", displayNumber: 42, trackingUrl: url })).toContain("saiu para entrega");
    expect(buildOrderNotificationBody({ type: "order_canceled", storeName: "Cantina", displayNumber: 42, trackingUrl: url })).toContain("cancelado");
    expect(buildOrderNotificationTemplateParameters({ type: "out_for_delivery", storeName: "Cantina", displayNumber: 42, trackingUrl: url })).toEqual([
      "Cantina", "#42", "Saiu para entrega", url,
    ]);
  });

  it("renders only controlled placeholders and rejects unsafe custom text", () => {
    const custom = "Olá {cliente}, o {pedido} da {restaurante} está como {status}. {link_acompanhamento}";
    expect(validateOrderNotificationTextTemplate(custom).ok).toBe(true);
    expect(renderOrderNotificationTextTemplate(custom, {
      cliente: "Ana",
      pedido: "#7",
      restaurante: "Cantina",
      status: "Pedido confirmado",
      link_acompanhamento: "https://app.pedeaqui.example/acompanhamento",
    })).toContain("Ana");
    expect(validateOrderNotificationTextTemplate("Acesse https://site-externo.example").ok).toBe(false);
    expect(validateOrderNotificationTextTemplate("<script>alert(1)</script>").ok).toBe(false);
    expect(validateOrderNotificationTextTemplate("Olá {variavel_inventada}").ok).toBe(false);
  });

  it("falls back to the safe default when a custom template needs unavailable data", () => {
    const body = buildOrderNotificationBody({
      type: "order_received",
      storeName: "Cantina",
      displayNumber: 42,
      trackingUrl: "https://app.pedeaqui.example/pedido/42",
      customTemplate: "Olá {cliente}, recebemos {pedido}.",
      customerName: null,
    });
    expect(body).toBe(buildOrderNotificationBody({
      type: "order_received",
      storeName: "Cantina",
      displayNumber: 42,
      trackingUrl: "https://app.pedeaqui.example/pedido/42",
    }));
    expect(body).toContain("recebemos seu pedido #42");
  });

  it("normalizes overrides without persisting defaults or invalid templates", () => {
    expect(normalizeOrderNotificationCustomTemplates({
      order_received: defaultOrderNotificationText("order_received"),
      order_confirmed: "Confirmamos {pedido} na {restaurante}.",
      delivered: "https://unsafe.example",
      unknown: "ignorar",
    })).toEqual({ order_confirmed: "Confirmamos {pedido} na {restaurante}." });
  });

  it("backs off retries instead of polling aggressively", () => {
    expect(retryDelaySeconds(1)).toBe(60);
    expect(retryDelaySeconds(2)).toBe(120);
    expect(retryDelaySeconds(20)).toBeLessThanOrEqual(3600);
  });
});

describe("[329] persistence and safety contracts", () => {
  const migration = read("supabase/sql/98_order_whatsapp_notifications.sql");
  const templateMigration = read("supabase/sql/99_order_whatsapp_template_support.sql");
  const customizationMigration = read("supabase/sql/187_whatsapp_automation_cancel_and_custom_templates.sql");
  const worker = read("src/server/conversations/order-notification-worker.ts");
  const provider = read("src/server/conversations/provider.ts");
  const dispatch = read("src/server/conversations/order-notification-dispatch.ts");
  const capability = read("src/server/conversations/whatsapp-automation-capability.ts");
  const accessRoute = read("src/app/m/[slug]/pedido/[id]/acesso/route.ts");
  const orderAction = read("src/features/orders/actions.ts");
  const deliveryAction = read("src/features/delivery/actions.ts");
  const paymentWebhook = read("src/app/api/webhooks/payments/mercado-pago/[storeId]/route.ts");

  it("reacts to authoritative domain events without changing the order state machine", () => {
    expect(migration).toContain("after insert on public.domain_events");
    expect(migration).toContain("when 'order.created' then 'order_received'");
    expect(migration).toContain("when 'payment.paid' then 'payment_paid'");
    expect(migration).toContain("when 'production.ready' then 'pickup_ready'");
    expect(migration).toContain("when 'fulfillment.out_for_delivery' then 'out_for_delivery'");
    expect(customizationMigration).toContain("when 'order.canceled' then 'order_canceled'");
    expect(worker).not.toContain("order_transition_internal");
  });

  it("deduplicates semantically and ties outbound replay to the authoritative event", () => {
    expect(migration).toContain("unique (organization_id, order_id, notification_type)");
    expect(customizationMigration).toContain("on conflict (organization_id, order_id, notification_type) do nothing");
    expect(worker).toContain("domain_event_id: string | null");
    expect(worker).toContain('errorCode: "authoritative_event_missing"');
    expect(worker).toContain("authoritativeEventId: job.domain_event_id");
    expect(worker).toContain("organizationId: job.organization_id");
    expect(worker).toContain("storeId: job.store_id");
    expect(worker).toContain("conversation_create_outbound_internal");
  });

  it("scopes order, settings, context and conversation dispatch to the claimed tenant/store", () => {
    expect(worker).toContain('.eq("organization_id", job.organization_id)');
    expect(worker).toContain('.eq("store_id", job.store_id)');
    expect(worker).toContain("WhatsAppAutomationCapabilityService.loadForStore(job.organization_id, job.store_id)");
    expect(worker).toContain("p_store_id: job.store_id");
  });

  it("dispatches first attempts after the authoritative response without blocking it", () => {
    expect(dispatch).toContain('import { after } from "next/server"');
    expect(dispatch).toContain("after(async () =>");
    expect(orderAction).toContain('scheduleOrderWhatsAppNotifications("checkout.order_created")');
    expect(orderAction).toContain("order_manager.${parsed.data}");
    expect(deliveryAction).toContain("scheduleOrderWhatsAppNotifications(`delivery.${intent}`)");
    expect(paymentWebhook).toContain('scheduleOrderWhatsAppNotifications("mercado_pago.webhook")');
  });

  it("uses free-form text only inside the support window and an approved template outside it", () => {
    expect(worker).toContain('eq("direction", "inbound")');
    expect(worker).toContain("CUSTOMER_SUPPORT_WINDOW_MS");
    expect(worker).toContain("provider.sendText");
    expect(worker).toContain("provider.sendTemplate");
    expect(worker).toContain("template_required");
    expect(provider).toContain('type: "template"');
    expect(provider).toContain("bodyParameters.map");
    expect(templateMigration).toContain("order_notification_template_name");
    expect(templateMigration).toContain("order_notification_template_language");
  });

  it("does not create a stale backlog when a Meta template is not configured", () => {
    const templateGate = worker.indexOf("if (!canSendFreeForm && !settings.order_notification_template_name)");
    const outboundCreate = worker.indexOf('admin.rpc("conversation_create_outbound_internal"');
    expect(templateGate).toBeGreaterThan(0);
    expect(templateGate).toBeLessThan(outboundCreate);
    expect(worker.slice(templateGate, outboundCreate)).toContain('status: "skipped"');
    expect(worker.slice(templateGate, outboundCreate)).not.toContain("retryAfterSeconds");
  });

  it("requires an actual canceled order before dispatching the cancellation automation", () => {
    expect(worker).toContain('job.notification_type === "order_canceled"');
    expect(worker).toContain('order.order_status !== "canceled"');
    expect(worker).toContain('errorCode: "cancel_state_mismatch"');
    expect(customizationMigration).toContain("notify_order_canceled boolean not null default false");
  });

  it("revalidates channel health through the shared capability resolver and never lets WhatsApp block an order", () => {
    expect(worker).toContain("connection_status");
    expect(worker).toContain("resolveWhatsAppAutomationCapabilities");
    expect(worker).toContain("automationCanDispatch(capability)");
    expect(worker).toContain('settings.connection_status === "temporarily_unavailable"');
    expect(worker).toContain('errorCode: "whatsapp_temporarily_unavailable"');
    expect(capability).toContain('state: "suspended_channel"');
    expect(capability).toContain("channelReason(input.channel)");
    expect(worker).not.toContain("order_transition_internal");
  });

  it("keeps tracking context service-role only and out of notification payloads", () => {
    expect(migration).toContain("revoke all on table public.order_notification_contexts from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.order_notification_contexts to service_role");
    expect(worker).not.toContain("address_street_snapshot");
    expect(worker).not.toContain("customer_phone_snapshot");
    expect(orderAction.indexOf("OrderNotificationContextService.capture")).toBeGreaterThan(orderAction.indexOf("OrderService.createFromCheckout"));
  });

  it("exchanges the tracking token for an HttpOnly cookie and removes it from the visible URL", () => {
    expect(accessRoute).toContain("PublicOrderService.get(slug, id, token)");
    expect(accessRoute).toContain("httpOnly: true");
    expect(accessRoute).toContain('"Referrer-Policy": "no-referrer"');
    expect(accessRoute).toContain("NextResponse.redirect(cleanUrl, 303)");
    expect(accessRoute).not.toContain("searchParams.set");
  });

  it("defaults the commercial feature to off while keeping the minimum event types preselected", () => {
    expect(migration).toContain("order_notifications_enabled boolean not null default false");
    expect(migration).toContain("notify_order_received boolean not null default true");
    expect(migration).toContain("notify_out_for_delivery boolean not null default true");
    expect(migration).toContain("notify_delivered boolean not null default false");
    expect(customizationMigration).toContain("notify_order_canceled boolean not null default false");
  });
});
