import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const AI_TOOL_NAMES = [
  "menu.search",
  "order.status",
  "customer.summary",
  "handoff.request",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

type ToolContext = {
  organizationId: string;
  storeId: string;
  contactId: string;
  customerId: string | null;
  conversationId: string;
};

async function loadToolContext(conversationId: string): Promise<ToolContext> {
  const admin = createAdminClient();
  const { data: conversation, error } = await admin.from("conversations")
    .select("id, organization_id, store_id, contact_id, status")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!conversation || conversation.status === "closed") throw new Error("Conversa indisponível para IA.");

  const { data: contact, error: contactError } = await admin.from("contacts")
    .select("id, customer_id")
    .eq("organization_id", conversation.organization_id)
    .eq("store_id", conversation.store_id)
    .eq("id", conversation.contact_id)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact) throw new Error("Contato da conversa não encontrado.");

  return {
    organizationId: conversation.organization_id,
    storeId: conversation.store_id,
    contactId: contact.id,
    customerId: contact.customer_id,
    conversationId: conversation.id,
  };
}

const menuSearchSchema = z.object({ query: z.string().trim().min(1).max(80) });
const orderStatusSchema = z.object({ displayNumber: z.coerce.number().int().positive() });
const emptySchema = z.object({}).strict();
const handoffSchema = z.object({ reason: z.string().trim().min(2).max(300) });

async function searchMenu(context: ToolContext, rawInput: unknown) {
  const input = menuSearchSchema.parse(rawInput);
  const admin = createAdminClient();
  const term = input.query.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
  const { data, error } = await admin.from("products")
    .select("id, name, description, price_cents, promotional_price_cents, availability")
    .eq("organization_id", context.organizationId)
    .eq("store_id", context.storeId)
    .eq("active", true)
    .eq("availability", "available")
    .is("deleted_at", null)
    .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
    .order("name")
    .limit(8);
  if (error) throw error;
  return (data ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    priceCents: Number(product.promotional_price_cents ?? product.price_cents),
  }));
}

async function orderStatus(context: ToolContext, rawInput: unknown) {
  const input = orderStatusSchema.parse(rawInput);
  if (!context.customerId) return { found: false };
  const admin = createAdminClient();
  const { data, error } = await admin.from("orders")
    .select("display_number, order_status, payment_status, production_status, fulfillment_status, fulfillment_type, total_cents, created_at")
    .eq("organization_id", context.organizationId)
    .eq("store_id", context.storeId)
    .eq("customer_id", context.customerId)
    .eq("display_number", input.displayNumber)
    .maybeSingle();
  if (error) throw error;
  return data ? { found: true, order: data } : { found: false };
}

async function customerSummary(context: ToolContext, rawInput: unknown) {
  emptySchema.parse(rawInput);
  if (!context.customerId) return { identified: false };
  const admin = createAdminClient();
  const [{ data: customer, error }, { data: cashback, error: cashbackError }, { data: loyalty, error: loyaltyError }] = await Promise.all([
    admin.from("customers").select("name, orders_count, last_order_at").eq("organization_id", context.organizationId).eq("id", context.customerId).is("deleted_at", null).maybeSingle(),
    admin.from("cashback_accounts").select("balance_cents").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("customer_id", context.customerId).maybeSingle(),
    admin.from("loyalty_accounts").select("balance_points").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("customer_id", context.customerId).maybeSingle(),
  ]);
  if (error) throw error;
  if (cashbackError) throw cashbackError;
  if (loyaltyError) throw loyaltyError;
  if (!customer) return { identified: false };
  return {
    identified: true,
    name: customer.name,
    ordersCount: customer.orders_count,
    lastOrderAt: customer.last_order_at,
    cashbackBalanceCents: Number(cashback?.balance_cents ?? 0),
    loyaltyBalancePoints: Number(loyalty?.balance_points ?? 0),
  };
}

async function requestHandoff(context: ToolContext, rawInput: unknown) {
  const input = handoffSchema.parse(rawInput);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("conversation_transition_internal", {
    p_conversation_id: context.conversationId,
    p_target_state: "waiting_agent",
    p_assigned_user_id: null,
    p_reason: input.reason,
    p_actor_user_id: null,
    p_source: "ai",
  });
  if (error) throw error;
  return { queued: true, status: data?.status ?? "waiting_agent" };
}

export async function executeConversationAiTool(conversationId: string, toolName: string, input: unknown) {
  if (!AI_TOOL_NAMES.includes(toolName as AiToolName)) throw new Error("Ferramenta de IA não autorizada.");
  const context = await loadToolContext(conversationId);
  if (toolName === "menu.search") return searchMenu(context, input);
  if (toolName === "order.status") return orderStatus(context, input);
  if (toolName === "customer.summary") return customerSummary(context, input);
  if (toolName === "handoff.request") return requestHandoff(context, input);
  throw new Error("Ferramenta de IA não autorizada.");
}
