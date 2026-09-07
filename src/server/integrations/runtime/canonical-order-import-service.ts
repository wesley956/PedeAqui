import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateCanonicalExternalOrder,
  type CanonicalExternalOrder,
} from "@/server/integrations/core/canonical-external-order";

const importResultSchema = z.object({
  order_id: z.string().uuid(),
  display_number: z.coerce.number().int().positive(),
  created: z.boolean(),
});

export type CanonicalOrderImportResult = z.infer<typeof importResultSchema>;

export class CanonicalOrderImportService {
  static async import(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    externalEventId?: string | null;
    externalStatus?: string | null;
    externalRevision?: string | null;
    correlationId?: string | null;
    order: CanonicalExternalOrder;
  }): Promise<CanonicalOrderImportResult> {
    const validation = validateCanonicalExternalOrder(input.order);
    if (!validation.valid) {
      throw new Error(`invalid canonical external order: ${validation.errors.join(",")}`);
    }

    const db = createAdminClient();
    const { data, error } = await db.rpc("integration_import_external_order", {
      p_organization_id: input.organizationId,
      p_store_id: input.storeId,
      p_integration_account_id: input.integrationAccountId,
      p_external_event_id: input.externalEventId ?? null,
      p_order: input.order,
      p_external_status: input.externalStatus ?? null,
      p_external_revision: input.externalRevision ?? null,
      p_correlation_id: input.correlationId ?? null,
    });
    if (error) throw error;
    return importResultSchema.parse(data);
  }
}