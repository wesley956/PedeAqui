import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorizeOrganization } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import { normalizePhone } from "@/server/customers/phone";

const customerInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
});
const customerSortSchema = z.enum(["recent", "spent", "orders", "name"]);
const uuidSchema = z.string().uuid();

export type CustomerInput = z.infer<typeof customerInputSchema>;
export type CustomerSort = z.infer<typeof customerSortSchema>;

function cleanSearch(value?: string) {
  return (value ?? "")
    .trim()
    .replace(/[(),%]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export class CustomerService {
  static async list(search?: string, sortInput?: string) {
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_VIEW);
    const admin = createAdminClient();
    const sort = customerSortSchema.catch("recent").parse(sortInput);
    const searchText = cleanSearch(search);
    const phoneDigits = searchText.replace(/\D/g, "");

    let query = admin.from("customers")
      .select("id, name, phone, email, birth_date, orders_count, total_spent_cents, average_ticket_cents, last_order_at, created_at")
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null)
      .limit(150);

    if (searchText) {
      const filters = [
        `name.ilike.%${searchText}%`,
        `email.ilike.%${searchText}%`,
      ];
      if (phoneDigits) filters.push(`phone_normalized.ilike.%${phoneDigits}%`);
      query = query.or(filters.join(","));
    }

    if (sort === "spent") query = query.order("total_spent_cents", { ascending: false }).order("name");
    if (sort === "orders") query = query.order("orders_count", { ascending: false }).order("name");
    if (sort === "name") query = query.order("name");
    if (sort === "recent") query = query.order("last_order_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;
    return { customers: data ?? [], sort, search: searchText };
  }

  static async profile(customerId: string) {
    const id = uuidSchema.parse(customerId);
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_VIEW);
    const admin = createAdminClient();
    const userClient = await createClient();

    const customerPromise = admin.from("customers")
      .select("id, name, phone, email, birth_date, orders_count, total_spent_cents, average_ticket_cents, last_order_at, created_at")
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const addressesPromise = admin.from("customer_addresses")
      .select("id, label, recipient_name, phone, postal_code, street, number, complement, district, city, state, reference, is_default, created_at")
      .eq("organization_id", context.organizationId)
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("created_at");
    const ordersPromise = userClient.from("orders")
      .select("id, display_number, store_id, channel, fulfillment_type, order_status, payment_status, total_cents, created_at, completed_at")
      .eq("organization_id", context.organizationId)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    const storesPromise = userClient.from("stores")
      .select("id, name")
      .eq("organization_id", context.organizationId);

    const [customerResult, addressesResult, ordersResult, storesResult] = await Promise.all([
      customerPromise,
      addressesPromise,
      ordersPromise,
      storesPromise,
    ]);
    if (customerResult.error) throw customerResult.error;
    if (!customerResult.data) throw new Error("Customer not found");
    if (addressesResult.error) throw addressesResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (storesResult.error) throw storesResult.error;

    const storeNames = new Map((storesResult.data ?? []).map((store) => [store.id, store.name]));
    const orders = (ordersResult.data ?? []).map((order) => ({
      ...order,
      store_name: storeNames.get(order.store_id) ?? "Unidade",
    }));

    return {
      customer: customerResult.data,
      addresses: addressesResult.data ?? [],
      orders,
      historyRestricted: customerResult.data.orders_count > 0 && orders.length === 0,
    };
  }

  static async create(input: CustomerInput) {
    const values = customerInputSchema.parse(input);
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_MANAGE);
    const admin = createAdminClient();
    const phoneNormalized = normalizePhone(values.phone);
    const { data, error } = await admin.from("customers").insert({
      organization_id: context.organizationId,
      name: values.name,
      phone: values.phone ?? null,
      phone_normalized: phoneNormalized,
      email: values.email ?? null,
      birth_date: values.birthDate ?? null,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, name, phone, email, birth_date, orders_count, total_spent_cents, average_ticket_cents, last_order_at").single();
    if (error) throw error;

    await AuditService.record(context, { action: "customer.created", entityType: "customer", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "customer.created", entityType: "customer", entityId: data.id, payload: { name: data.name } });
    return data;
  }
}
