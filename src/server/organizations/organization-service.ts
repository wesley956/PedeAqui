import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeOrganization } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";

const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(180).nullable().optional(),
  document: z.string().trim().max(32).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export class OrganizationService {
  static async update(input: z.input<typeof updateOrganizationSchema>) {
    const values = updateOrganizationSchema.parse(input);
    const context = await authorizeOrganization(PERMISSIONS.ORGANIZATION_MANAGE);
    const admin = createAdminClient();

    const { data: before, error: beforeError } = await admin
      .from("organizations")
      .select("id, name, legal_name, document, phone, email")
      .eq("id", context.organizationId)
      .single();
    if (beforeError) throw beforeError;

    const patch = {
      name: values.name,
      legal_name: values.legalName ?? null,
      document: values.document ?? null,
      phone: values.phone ?? null,
      email: values.email ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: after, error } = await admin
      .from("organizations")
      .update(patch)
      .eq("id", context.organizationId)
      .select("id, name, legal_name, document, phone, email")
      .single();
    if (error) throw error;

    await AuditService.record(context, {
      action: "organization.updated",
      entityType: "organization",
      entityId: context.organizationId,
      before,
      after,
    });
    await EventService.enqueue(context, {
      type: "organization.updated",
      entityType: "organization",
      entityId: context.organizationId,
      payload: { changed: Object.keys(patch) },
    });

    return after;
  }
}
