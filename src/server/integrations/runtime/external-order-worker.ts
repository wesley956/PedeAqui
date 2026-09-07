import "server-only";

import { CanonicalOrderImportService } from "@/server/integrations/runtime/canonical-order-import-service";
import {
  processExternalOrderInboxBatch,
  type ProcessExternalOrderInboxBatchInput,
} from "@/server/integrations/runtime/external-order-inbox-handler";

export type ConfiguredExternalOrderInboxBatchInput = Omit<
  ProcessExternalOrderInboxBatchInput,
  "importOrder"
>;

/**
 * Server-only composition root for marketplace order ingestion. The pure worker
 * receives the concrete Supabase-backed importer here, keeping admin database
 * access out of testable orchestration code and out of client bundles.
 */
export async function processConfiguredExternalOrderInboxBatch(
  input: ConfiguredExternalOrderInboxBatchInput,
) {
  return processExternalOrderInboxBatch({
    ...input,
    importOrder: (orderInput) => CanonicalOrderImportService.import(orderInput),
  });
}
