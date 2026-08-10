import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/access/authorize";
import { getAccessContext } from "@/server/access/context";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

const storeInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().email().nullable().optional(),
  postalCode: z.string().trim().max(16).nullable().optional(),
  street: z.string().trim().max(160).nullable().optional(),
  number: z.string().trim().max(24).nullable().optional(),
  complement: z.string().trim().max(120).nullable().optional(),
  district: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(32).nullable().optional(),
});

export class StoreService {
  static async list() {
    const context = await getAccessContext();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, slug, status, is_primary, city, state")
      .eq("organization_id", context.organizationId)
      .order("is_primary", { ascending: false })
      .order("name");

    if (error) throw error;
    return data ?? [];
  }

  static async create(input: z.input<typeof storeInputSchema>) {
    const values = storeInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("stores")
      .insert({
        organization_id: context.organizationId,
        name: values.name,
        slug: values.slug,
        phone: values.phone ?? null,
        email: values.email ?? null,
        postal_code: values.postalCode ?? null,
        street: values.street ?? null,
        number: values.number ?? null,
        complement: values.complement ?? null,
        district: values.district ?? null,
        city: values.city ?? null,
        state: values.state ?? null,
        status: "active",
      })
      .select("id, name, slug, status")
      .single();
    if (error) throw error;

    await AuditService.record(context, {
      action: "store.created",
      entityType: "store",
      entityId: data.id,
      after: data,
    });
    await EventService.enqueue({ ...context, storeId: data.id }, {
      type: "store.created",
      entityType: "store",
      entityId: data.id,
      payload: { name: data.name, slug: data.slug },
    });

    return data;
  }

  static async setStatus(storeId: string, status: "active" | "inactive" | "temporarily_closed") {
    const parsedStoreId = z.string().uuid().parse(storeId);
    const context = await authorize(PERMISSIONS.STORES_MANAGE);
    const admin = createAdminClient();

    const { data: before, error: beforeError } = await admin
      .from("stores")
      .select("id, status")
      .eq("id", parsedStoreId)
      .eq("organization_id", context.organizationId)
      .single();
    if (beforeError) throw beforeError;

    const { data: after, error } = await admin
      .from("stores")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", parsedStoreId)
      .eq("organization_id", context.organizationId)
      .select("id, status")
      .single();
    if (error) throw error;

    const storeContext = { ...context, storeId: parsedStoreId };
    await AuditService.record(storeContext, {
      action: "store.status_changed",
      entityType: "store",
      entityId: parsedStoreId,
      before,
      after,
    });
    await EventService.enqueue(storeContext, {
      type: "store.status_changed",
      entityType: "store",
      entityId: parsedStoreId,
      payload: { status },
    });

    return after;
  }
}
