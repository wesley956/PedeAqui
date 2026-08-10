import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrganization } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

const uuidSchema = z.string().uuid();
export const addressInputSchema = z.object({
  label: z.string().trim().min(2).max(40).default("Principal"),
  recipientName: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  postalCode: z.string().trim().min(8).max(12),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(30),
  complement: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  reference: z.string().trim().max(240).nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

export class CustomerAddressService {
  static async list(customerId: string) {
    const id = uuidSchema.parse(customerId);
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_VIEW);
    const admin = createAdminClient();
    const { data: customer, error: customerError } = await admin.from("customers").select("id, name, phone, email")
      .eq("id", id).eq("organization_id", context.organizationId).is("deleted_at", null).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Customer not found");
    const { data, error } = await admin.from("customer_addresses")
      .select("id, label, recipient_name, phone, postal_code, street, number, complement, district, city, state, reference, is_default, created_at")
      .eq("organization_id", context.organizationId).eq("customer_id", id).is("deleted_at", null)
      .order("is_default", { ascending: false }).order("created_at");
    if (error) throw error;
    return { customer, addresses: data ?? [] };
  }

  static async create(customerId: string, input: AddressInput) {
    const id = uuidSchema.parse(customerId);
    const values = addressInputSchema.parse(input);
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_MANAGE);
    const admin = createAdminClient();
    const { data: customer, error: customerError } = await admin.from("customers").select("id")
      .eq("id", id).eq("organization_id", context.organizationId).is("deleted_at", null).maybeSingle();
    if (customerError) throw customerError;
    if (!customer) throw new Error("Customer not found");
    const { count, error: countError } = await admin.from("customer_addresses").select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId).eq("customer_id", id).is("deleted_at", null);
    if (countError) throw countError;
    const { data, error } = await admin.from("customer_addresses").insert({
      organization_id: context.organizationId,
      customer_id: id,
      label: values.label,
      recipient_name: values.recipientName ?? null,
      phone: values.phone ?? null,
      postal_code: values.postalCode,
      street: values.street,
      number: values.number,
      complement: values.complement ?? null,
      district: values.district,
      city: values.city,
      state: values.state,
      reference: values.reference ?? null,
      is_default: values.isDefault || (count ?? 0) === 0,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, label, street, number, district, city, state, is_default").single();
    if (error) throw error;
    await AuditService.record(context, { action: "customer.address_created", entityType: "customer_address", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "customer.address_created", entityType: "customer", entityId: id, payload: { address_id: data.id } });
    return data;
  }

  static async setDefault(addressId: string) {
    const id = uuidSchema.parse(addressId);
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_MANAGE);
    const admin = createAdminClient();
    const { data, error } = await admin.from("customer_addresses").update({ is_default: true, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).is("deleted_at", null)
      .select("id, customer_id, is_default").single();
    if (error) throw error;
    await AuditService.record(context, { action: "customer.address_defaulted", entityType: "customer_address", entityId: id, after: data });
    return data;
  }

  static async remove(addressId: string) {
    const id = uuidSchema.parse(addressId);
    const context = await authorizeOrganization(PERMISSIONS.CUSTOMERS_MANAGE);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("customer_addresses").select("id, customer_id, label, is_default")
      .eq("id", id).eq("organization_id", context.organizationId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await admin.from("customer_addresses").update({ deleted_at: new Date().toISOString(), is_default: false, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId);
    if (error) throw error;
    await AuditService.record(context, { action: "customer.address_removed", entityType: "customer_address", entityId: id, before });
    return before.customer_id;
  }
}
