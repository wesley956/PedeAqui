import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/server/conversations/inbox-context-service.ts", "utf8");
const page = readFileSync("src/app/(app)/conversas/page.tsx", "utf8");

describe("WPP-05 Inbox customer/address/order context", () => {
  it("resolves the conversation and contact inside the active organization/store", () => {
    expect(service).toContain('from("conversations")');
    expect(service).toContain('.eq("organization_id", access.organizationId)');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).toContain('from("contacts")');
    expect(service).toContain('customer_id');
    expect(service).not.toContain("phonesBelongToSameCustomer");
    expect(service).not.toContain("phoneVariants");
  });

  it("uses existing customer and order permissions and degrades only AuthorizationError", () => {
    expect(service).toContain("PERMISSIONS.CONVERSATIONS_VIEW");
    expect(service).toContain("PERMISSIONS.CUSTOMERS_VIEW");
    expect(service).toContain("PERMISSIONS.ORDERS_VIEW");
    expect(service).toContain("error instanceof AuthorizationError");
    expect(page).toContain("Seu perfil não possui acesso aos dados do cliente e endereços.");
    expect(page).toContain("Seu perfil não possui acesso aos pedidos desta unidade.");
  });

  it("loads canonical customer addresses without creating a WhatsApp-specific copy", () => {
    expect(service).toContain('from("customers")');
    expect(service).toContain('from("customer_addresses")');
    expect(service).toContain('.eq("customer_id", customerId)');
    expect(service).toContain('complement');
    expect(service).toContain('reference');
    expect(service).not.toContain("whatsapp_customers");
    expect(page).toContain("ENDEREÇOS");
    expect(page).toContain("address.complement");
    expect(page).toContain("address.reference");
  });

  it("keeps persisted orders store-scoped and opens only the canonical order route", () => {
    expect(service).toContain('from("orders")');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).toContain('.eq("customer_id", customerId)');
    expect(service).toContain('.not("order_status", "in", "(completed,rejected,canceled)")');
    expect(service).toContain('.in("order_status", ["completed", "rejected", "canceled"])');
    expect(service).toContain('from("order_items")');
    expect(service).toContain('.eq("order_id", currentRow.id)');
    expect(page).toContain('href={`/pedidos/${detailContext.currentOrder.id}`}');
    expect(page).toContain('href={`/pedidos/${order.id}`}');
  });

  it("projects an active WhatsApp cart from the conversation session without repricing it", () => {
    expect(service).toContain('from("automation_sessions")');
    expect(service).toContain('.eq("conversation_id", conversationId)');
    expect(service).toContain('session.state !== "active"');
    expect(service).toContain("isWhatsAppOrderStep(session.step)");
    expect(service).toContain("Date.parse(session.expires_at) <= Date.now()");
    expect(service).toContain('context.channel !== "whatsapp_order"');
    expect(service).toContain("hashCartToken(context.cartToken)");
    expect(service).toContain('from("carts")');
    expect(service).toContain('.eq("token_hash", tokenHash)');
    expect(service).toContain('from("cart_items")');
    expect(service).not.toContain("CartService");
    expect(service).not.toContain("cart_apply_reprice_internal");
    expect(service).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
    expect(page).toContain("Em montagem no WhatsApp");
  });

  it("never renders the cart token/hash or raw session context in the page", () => {
    expect(page).not.toContain("cartToken");
    expect(page).not.toContain("tokenHash");
    expect(page).not.toContain("automation_sessions");
    expect(page).not.toContain("session.context");
    expect(service).not.toContain("cartToken: context.cartToken");
    expect(service).not.toContain("tokenHash,");
  });

  it("keeps WPP-05 read-only and preserves conversation handoff controls", () => {
    expect(service).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
    expect(page).toContain("assumeConversationAction");
    expect(page).toContain("queueConversationAction");
    expect(page).toContain("returnConversationToBotAction");
    expect(page).toContain("sendConversationMessageAction");
    expect(page).toContain("o retorno ao robô é manual");
  });
});
