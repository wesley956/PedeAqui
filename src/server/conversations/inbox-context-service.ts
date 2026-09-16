import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { hashCartToken } from "@/server/cart/cart-token";
import { isWhatsAppOrderStep } from "@/server/conversations/whatsapp-smart-order-service";

type Access = Awaited<ReturnType<typeof authorize>>;
type InboxPermission = "customer" | "orders";

type InboxOrderRow = {
  id: string;
  display_number: number;
  channel: string;
  fulfillment_type: string;
  order_status: string;
  payment_status: string;
  production_status: string;
  fulfillment_status: string;
  total_cents: number;
  created_at: string;
  updated_at: string;
};

async function canView(permission: typeof PERMISSIONS.CUSTOMERS_VIEW | typeof PERMISSIONS.ORDERS_VIEW, access: Access) {
  try {
    await authorize(permission, access);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

function safeOrder(row: InboxOrderRow) {
  return {
    id: row.id,
    displayNumber: Number(row.display_number),
    channel: row.channel,
    fulfillmentType: row.fulfillment_type,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    productionStatus: row.production_status,
    fulfillmentStatus: row.fulfillment_status,
    totalCents: Number(row.total_cents ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class InboxContextService {
  static async load(conversationId: string) {
    const access = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    if (!access.storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
    const storeId = access.storeId;
    const admin = createAdminClient();

    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, contact_id")
      .eq("id", conversationId)
      .eq("organization_id", access.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("Conversa não encontrada nesta unidade.");

    const { data: contact, error: contactError } = await admin.from("contacts")
      .select("id, name, phone_normalized, external_id, customer_id")
      .eq("id", conversation.contact_id)
      .eq("organization_id", access.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contact) throw new Error("Contato da conversa não encontrado nesta unidade.");

    const customerId = contact.customer_id ?? null;
    const [customerAllowed, ordersAllowed] = await Promise.all([
      canView(PERMISSIONS.CUSTOMERS_VIEW, access),
      canView(PERMISSIONS.ORDERS_VIEW, access),
    ]);

    const customerContext = customerId && customerAllowed
      ? await this.loadCustomerContext(access.organizationId, customerId)
      : null;
    const orderContext = customerId && ordersAllowed
      ? await this.loadOrderContext(access.organizationId, storeId, customerId)
      : { current: null, history: [], currentItems: [] };
    const draft = ordersAllowed
      ? await this.loadWhatsAppDraft(access.organizationId, storeId, conversationId)
      : null;

    return {
      contact: {
        id: contact.id,
        name: contact.name ?? null,
        phone: contact.phone_normalized ?? contact.external_id ?? null,
      },
      linkedCustomerId: customerId,
      permissions: {
        customer: customerAllowed ? "available" as const : "restricted" as const,
        orders: ordersAllowed ? "available" as const : "restricted" as const,
      } satisfies Record<InboxPermission, "available" | "restricted">,
      customer: customerContext?.customer ?? null,
      addresses: customerContext?.addresses ?? [],
      currentOrder: orderContext.current,
      currentOrderItems: orderContext.currentItems,
      orderHistory: orderContext.history,
      whatsappDraft: draft,
    };
  }

  private static async loadCustomerContext(organizationId: string, customerId: string) {
    const admin = createAdminClient();
    const [customerResult, addressesResult] = await Promise.all([
      admin.from("customers")
        .select("id, name, phone, email, orders_count, total_spent_cents, average_ticket_cents, last_order_at, created_at")
        .eq("id", customerId)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .maybeSingle(),
      admin.from("customer_addresses")
        .select("id, label, recipient_name, phone, postal_code, street, number, complement, district, city, state, reference, is_default, created_at")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (customerResult.error) throw customerResult.error;
    if (addressesResult.error) throw addressesResult.error;

    return {
      customer: customerResult.data ? {
        id: customerResult.data.id,
        name: customerResult.data.name,
        phone: customerResult.data.phone,
        email: customerResult.data.email,
        ordersCount: Number(customerResult.data.orders_count ?? 0),
        totalSpentCents: Number(customerResult.data.total_spent_cents ?? 0),
        averageTicketCents: Number(customerResult.data.average_ticket_cents ?? 0),
        lastOrderAt: customerResult.data.last_order_at,
        createdAt: customerResult.data.created_at,
      } : null,
      addresses: (addressesResult.data ?? []).map((address) => ({
        id: address.id,
        label: address.label,
        recipientName: address.recipient_name,
        phone: address.phone,
        postalCode: address.postal_code,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
        reference: address.reference,
        isDefault: Boolean(address.is_default),
      })),
    };
  }

  private static async loadOrderContext(organizationId: string, storeId: string, customerId: string) {
    const admin = createAdminClient();
    const orderFields = "id, display_number, channel, fulfillment_type, order_status, payment_status, production_status, fulfillment_status, total_cents, created_at, updated_at";
    const [currentResult, historyResult] = await Promise.all([
      admin.from("orders")
        .select(orderFields)
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .not("order_status", "in", "(completed,rejected,canceled)")
        .order("created_at", { ascending: false })
        .limit(1),
      admin.from("orders")
        .select(orderFields)
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .in("order_status", ["completed", "rejected", "canceled"])
        .order("created_at", { ascending: false })
        .limit(4),
    ]);
    if (currentResult.error) throw currentResult.error;
    if (historyResult.error) throw historyResult.error;

    const currentRow = ((currentResult.data ?? [])[0] ?? null) as InboxOrderRow | null;
    const history = ((historyResult.data ?? []) as InboxOrderRow[]).map(safeOrder);
    let currentItems: Array<{ id: string; name: string; quantity: number; lineTotalCents: number }> = [];

    if (currentRow) {
      const { data: items, error: itemError } = await admin.from("order_items")
        .select("id, product_name_snapshot, quantity, line_total_cents")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .eq("order_id", currentRow.id)
        .order("created_at")
        .limit(12);
      if (itemError) throw itemError;
      currentItems = (items ?? []).map((item) => ({
        id: item.id,
        name: item.product_name_snapshot,
        quantity: Number(item.quantity ?? 0),
        lineTotalCents: Number(item.line_total_cents ?? 0),
      }));
    }

    return {
      current: currentRow ? safeOrder(currentRow) : null,
      history,
      currentItems,
    };
  }

  private static async loadWhatsAppDraft(organizationId: string, storeId: string, conversationId: string) {
    const admin = createAdminClient();
    const { data: session, error: sessionError } = await admin.from("automation_sessions")
      .select("step, state, context, expires_at")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || session.state !== "active" || !isWhatsAppOrderStep(session.step)) return null;
    if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) return null;

    const context = session.context && typeof session.context === "object"
      ? session.context as Record<string, unknown>
      : null;
    if (!context || context.channel !== "whatsapp_order" || typeof context.cartToken !== "string" || !context.cartToken) return null;

    const tokenHash = hashCartToken(context.cartToken);
    const { data: cart, error: cartError } = await admin.from("carts")
      .select("id, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, expires_at, updated_at")
      .eq("organization_id", organizationId)
      .eq("store_id", storeId)
      .eq("token_hash", tokenHash)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cartError) throw cartError;
    if (!cart) return null;

    const { data: items, error: itemError } = await admin.from("cart_items")
      .select("id, product_name_snapshot, quantity, line_total_cents")
      .eq("cart_id", cart.id)
      .order("created_at")
      .limit(12);
    if (itemError) throw itemError;

    return {
      step: session.step,
      subtotalCents: Number(cart.subtotal_cents ?? 0),
      discountCents: Number(cart.discount_cents ?? 0),
      deliveryFeeCents: Number(cart.delivery_fee_cents ?? 0),
      totalCents: Number(cart.total_cents ?? 0),
      updatedAt: cart.updated_at,
      expiresAt: cart.expires_at,
      items: (items ?? []).map((item) => ({
        id: item.id,
        name: item.product_name_snapshot,
        quantity: Number(item.quantity ?? 0),
        lineTotalCents: Number(item.line_total_cents ?? 0),
      })),
    };
  }
}
