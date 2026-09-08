import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { IntegrationProviderError } from "@/server/integrations/core/errors";

export type IfoodOrderLifecycleMilestone = "confirmed" | "preparing" | "ready" | "canceled" | "concluded";

function normalizedCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/**
 * Maps both iFood polling event codes and order-detail statuses. Polling event
 * names are preferred, while order status is a safe fallback when an event
 * code evolves but the fetched order already exposes the authoritative state.
 */
export function resolveIfoodLifecycleMilestone(input: {
  eventType?: string | null;
  externalStatus?: string | null;
}): IfoodOrderLifecycleMilestone | null {
  const values = [normalizedCode(input.eventType), normalizedCode(input.externalStatus)].filter(Boolean);
  for (const value of values) {
    if (["CFM", "CONFIRMED", "ORDER_CONFIRMED"].includes(value)) return "confirmed";
    if (["PRS", "PREPARATION_STARTED", "PREPARATIONSTARTED", "ORDER_PREPARATION_STARTED"].includes(value)) return "preparing";
    if (["RTP", "READY_TO_PICKUP", "READYTOPICKUP", "ORDER_READY_TO_PICKUP"].includes(value)) return "ready";
    if (["CAN", "CANCELLED", "CANCELED", "ORDER_CANCELLED", "ORDER_CANCELED"].includes(value)) return "canceled";
    if (["CON", "CONCLUDED", "ORDER_CONCLUDED"].includes(value)) return "concluded";
  }
  return null;
}

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
