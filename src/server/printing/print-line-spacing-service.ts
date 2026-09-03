import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";

export const printLineSpacingSchema = z.enum(["compact", "normal", "comfortable", "wide"]);
export type PrintLineSpacing = z.infer<typeof printLineSpacingSchema>;

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export class PrintLineSpacingService {
  static async get(): Promise<PrintLineSpacing> {
    const context = await authorize(PERMISSIONS.PRINTING_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_print_preferences")
      .select("line_spacing")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    return printLineSpacingSchema.catch("normal").parse(data?.line_spacing);
  }

  static async save(input: unknown): Promise<PrintLineSpacing> {
    const lineSpacing = printLineSpacingSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("store_print_preferences")
      .select("line_spacing")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (readError) throw readError;
    const previous = printLineSpacingSchema.catch("normal").parse(before?.line_spacing);
    if (previous === lineSpacing) return lineSpacing;

    const { data, error } = await admin.from("store_print_preferences")
      .upsert({
        organization_id: context.organizationId,
        store_id: storeId,
        line_spacing: lineSpacing,
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id" })
      .select("line_spacing")
      .single();
    if (error) throw error;

    await AuditService.record(context, {
      action: "print.line_spacing_updated",
      entityType: "store_print_preferences",
      entityId: storeId,
      before: { line_spacing: previous },
      after: { line_spacing: data.line_spacing },
    });
    return printLineSpacingSchema.parse(data.line_spacing);
  }
}
