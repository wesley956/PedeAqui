import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { IntegrationProviderError } from "@/server/integrations/core/errors";
import {
  resolveIfoodLifecycleMilestone,
  type IfoodOrderLifecycleMilestone,
} from "@/server/integrations/providers/ifood/ifood-order-lifecycle-milestones";

export async function reconcileIfoodOrderLifecycle(input: {
  organizationId: string;
  storeId: string;
  orderId: string;
  integrationAccountId: string;
  externalOrderId: string;
  externalEventId?: string | null;
  eventType?: string | null;
  externalStatus?: string | null;
}): Promise<{ milestone: IfoodOrderLifecycleMilestone | null }> {
  const milestone = resolveIfoodLifecycleMilestone({
    eventType: input.eventType,
    externalStatus: input.externalStatus,
  });
  if (!milestone) return { milestone: null };

  const db = createAdminClient();
  const { error } = await db.rpc("integration_reconcile_ifood_order_lifecycle", {
    p_organization_id: input.organizationId,
    p_store_id: input.storeId,
    p_order_id: input.orderId,
    p_integration_account_id: input.integrationAccountId,
    p_external_order_id: input.externalOrderId,
    p_milestone: milestone,
    p_external_event_id: input.externalEventId ?? null,
  });
  if (error) {
    throw new IntegrationProviderError(
      "Could not reconcile the iFood lifecycle event with the canonical order",
      "ifood_order_lifecycle_reconcile_failed",
      true,
      { cause: error },
    );
  }
  return { milestone };
}
