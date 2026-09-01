import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";
import { logger } from "@/server/observability/logger";
import {
  PRODUCT_EXPERIENCE_SCHEMA_VERSION,
  type ProductExperienceEventName,
  type ProductExperienceOutcome,
  safeProductMetadata,
} from "@/server/product-experience/contracts";

type CaptureInput = {
  eventName: ProductExperienceEventName;
  sessionId?: string | null;
  orderId?: string | null;
  outcome?: ProductExperienceOutcome | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  source: "client" | "server" | "derived";
};

export class ProductExperienceService {
  /**
   * Best effort by contract: telemetry must never become part of a business
   * transaction or make a restaurant action fail.
   */
  static async capture(context: AccessContext, input: CaptureInput): Promise<boolean> {
    if (!context.storeId) return false;
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("product_experience_events").insert({
        organization_id: context.organizationId,
        store_id: context.storeId,
        actor_user_id: context.userId,
        session_id: input.sessionId ?? null,
        order_id: input.orderId ?? null,
        event_name: input.eventName,
        schema_version: PRODUCT_EXPERIENCE_SCHEMA_VERSION,
        source: input.source,
        outcome: input.outcome ?? null,
        duration_ms: input.durationMs == null ? null : Math.round(input.durationMs),
        metadata: safeProductMetadata(input.eventName, input.metadata),
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      });
      if (error) throw error;
      return true;
    } catch (error) {
      logger.warn("product_experience_capture_failed", {
        organizationId: context.organizationId,
        storeId: context.storeId,
        eventName: input.eventName,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return false;
    }
  }
}
