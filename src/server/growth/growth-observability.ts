import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordFailure } from "@/server/observability/failure";

type GrowthOperationalEvent = {
  organizationId: string;
  storeId: string;
  eventType: string;
  outcome: "success" | "partial" | "skipped" | "failed" | "blocked";
  reasonCode?: string | null;
  source: string;
  campaignId?: string | null;
  ruleId?: string | null;
  conversationId?: string | null;
  counts?: Record<string, number>;
  durationMs?: number | null;
  requestId?: string;
};

export async function recordGrowthOperationalEvent(event: GrowthOperationalEvent) {
  try {
    const admin = createAdminClient();
    const result = await admin.rpc("growth_record_operational_event_internal", {
      p_organization_id: event.organizationId,
      p_store_id: event.storeId,
      p_event_type: event.eventType,
      p_outcome: event.outcome,
      p_reason_code: event.reasonCode ?? null,
      p_source: event.source,
      p_campaign_id: event.campaignId ?? null,
      p_rule_id: event.ruleId ?? null,
      p_conversation_id: event.conversationId ?? null,
      p_counts: event.counts ?? {},
      p_duration_ms: event.durationMs ?? null,
    });
    if (!result?.error) return;
    throw result.error;
  } catch (error) {
    recordFailure("growth.observability.write_failed", error, {
      requestId: event.requestId ?? `growth-observability:${event.eventType}`,
      organizationId: event.organizationId,
      storeId: event.storeId,
      campaignId: event.campaignId ?? undefined,
    });
  }
}

export type CampaignMetric = {
  campaign_id: string;
  prepared: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  suppressed: number;
  opted_out: number;
  invalid_contact: number;
  responses: number;
  assisted_orders: number;
  assisted_revenue_cents: number;
  coupons_used: number;
};

export type GrowthMetrics = {
  window_days: number;
  attribution_days: number;
  generated_at: string;
  methodology: string;
  campaigns: CampaignMetric[];
  automations: { executed: number; completed: number; skipped: number; failed: number; processing: number };
  benefits: { cashback_earned_cents: number; cashback_redeemed_cents: number; points_earned: number; points_redeemed: number };
  operations: Array<{ event_type: string; outcome: string; reason_code: string | null; count: number }>;
};

export function emptyGrowthMetrics(): GrowthMetrics {
  return {
    window_days: 30,
    attribution_days: 7,
    generated_at: new Date(0).toISOString(),
    methodology: "Retornos, respostas, cupons e receita são assistidos quando ocorrem após o envio dentro da janela; não representam causalidade garantida.",
    campaigns: [],
    automations: { executed: 0, completed: 0, skipped: 0, failed: 0, processing: 0 },
    benefits: { cashback_earned_cents: 0, cashback_redeemed_cents: 0, points_earned: 0, points_redeemed: 0 },
    operations: [],
  };
}
