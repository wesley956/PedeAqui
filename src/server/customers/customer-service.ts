import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrganization } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

const customerInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
});

export type CustomerInput = z.infer<typeof customerInputSchema>;

export function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) throw new Error("Invalid phone number");
  return digits;
}

export class CustomerService {
  static async list(search?: string) {
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_VIEW);
    const admin = createAdminClient();
    let query = admin.from("customers")
      .select("id, name, phone, email, birth_date, orders_count, total_spent_cents, average_ticket_cents, last_order_at, created_at")
      .eq("organization_id", context.organizationId)
      .is("deleted_at", null)
      .order("name")
      .limit(100);
    if (search?.trim()) query = query.ilike("name", `%${search.trim().replace(/[%,]/g, "")}%`);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
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
