import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { InboundOutcome } from "@/server/conversations/inbound-outcome-service";
import type { LegacyIntelligenceDecision } from "@/server/conversations/legacy-intelligence-observation";
import type { UnifiedRouterDecision } from "@/server/intelligence/unified-router";
import { failureCode } from "@/server/observability/failure-classification";
import { logger } from "@/server/observability/logger";

export type LegacyIntelligenceHandler = "whatsapp_order" | "greeting" | "none";
export type ShadowComparisonStatus = "match" | "mismatch" | "not_observed";

export const SHADOW_COMPARISON_DIMENSIONS = [
  "intent",
  "tool",
  "price",
  "availability",
  "promotion",
  "order_status",
  "payment",
  "delivery",
  "growth",
  "handoff",
] as const;

export type ShadowComparisonDimension = (typeof SHADOW_COMPARISON_DIMENSIONS)[number];
export type ShadowComparisons = Record<ShadowComparisonDimension, ShadowComparisonStatus>;

export type IntelligenceShadowPreparation = {
  organizationId: string;
  storeId: string;
  conversationId: string;
  messageId: string;
  requestId: string;
  correlationId: string;
  decision: UnifiedRouterDecision | null;
  nextDurationMs: number;
  nextErrorType: string | null;
  nextErrorCode: string | null;
  duplicateSideEffectPrevented: boolean;
};

export type IntelligenceShadowCompletion = {
  legacyHandler: LegacyIntelligenceHandler;
  legacyDecision: LegacyIntelligenceDecision | null;
  legacyOutcome: InboundOutcome;
  legacyDurationMs: number;
};

export type IntelligenceShadowObservation = {
  organization_id: string;
  store_id: string;
  conversation_id: string;
  message_id: string;
  request_id: string;
  correlation_id: string;
  channel: "whatsapp";
  legacy_handler: LegacyIntelligenceHandler;
  legacy_intent: string | null;
  legacy_tool: string | null;
  legacy_outcome: InboundOutcome;
  next_intent: string | null;
  next_tool: string | null;
  next_would_handle: boolean | null;
  capability_key: string | null;
  capability_allowed: boolean | null;
  capability_reason: string | null;
  authority_operation: string | null;
  authority_allowed: boolean | null;
  authority_reason: string | null;
  canonical_result_class: InboundOutcome;
  audience_projection: "customer";
  fallback_observed: boolean;
  handoff_observed: boolean;
  comparisons: ShadowComparisons;
  divergence_codes: string[];
  critical_mismatch: boolean;
  next_error_type: string | null;
  next_error_code: string | null;
  legacy_duration_ms: number;
  next_duration_ms: number;
  duplicate_side_effect_prevented: boolean;
};

function expectedLegacyHandler(decision: UnifiedRouterDecision | null): LegacyIntelligenceHandler | null {
  if (!decision) return null;
  if (decision.handoffReason === "human_lock") return "none";
  return decision.tool === "whatsapp_order" && decision.wouldHandle ? "whatsapp_order" : "greeting";
}

function capabilityReason(decision: UnifiedRouterDecision | null) {
  if (decision?.requiredCapability && !decision.capabilityDecision) return "not_resolved";
  if (!decision?.capabilityDecision) return null;
  return decision.capabilityDecision.reasons.join(",").slice(0, 120) || null;
}

function buildComparisons(
  decision: UnifiedRouterDecision | null,
  completion: IntelligenceShadowCompletion,
  duplicateSideEffectPrevented: boolean,
): ShadowComparisons {
  const notObserved = Object.fromEntries(
    SHADOW_COMPARISON_DIMENSIONS.map((dimension) => [dimension, "not_observed"]),
  ) as ShadowComparisons;
  if (duplicateSideEffectPrevented) return notObserved;
  if (!decision) return notObserved;

  if (completion.legacyDecision) {
    notObserved.intent = decision.intent === completion.legacyDecision.intent ? "match" : "mismatch";
    notObserved.tool = decision.tool === completion.legacyDecision.tool ? "match" : "mismatch";
  }

  const nextHandoff = decision.handoffReason === "human_lock" || decision.handoffReason === "explicit_handoff";
  const legacyHandoff = completion.legacyOutcome === "waiting_agent" || completion.legacyOutcome === "human";
  if (nextHandoff || legacyHandoff) notObserved.handoff = nextHandoff === legacyHandoff ? "match" : "mismatch";
  return notObserved;
}

export function buildIntelligenceShadowObservation(
  preparation: IntelligenceShadowPreparation,
  completion: IntelligenceShadowCompletion,
): IntelligenceShadowObservation {
  const decision = preparation.decision;
  const comparisons = buildComparisons(decision, completion, preparation.duplicateSideEffectPrevented);
  const divergenceCodes = Object.entries(comparisons)
    .filter(([, status]) => status === "mismatch")
    .map(([dimension]) => `${dimension}_mismatch`);
  if (preparation.nextErrorType) divergenceCodes.push("next_error");
  const handlerMismatch = !preparation.duplicateSideEffectPrevented
    && expectedLegacyHandler(decision) !== completion.legacyHandler;
  if (decision && handlerMismatch) divergenceCodes.push("handler_mismatch");

  return {
    organization_id: preparation.organizationId,
    store_id: preparation.storeId,
    conversation_id: preparation.conversationId,
    message_id: preparation.messageId,
    request_id: preparation.requestId,
    correlation_id: preparation.correlationId,
    channel: "whatsapp",
    legacy_handler: completion.legacyHandler,
    legacy_intent: completion.legacyDecision?.intent ?? null,
    legacy_tool: completion.legacyDecision?.tool ?? null,
    legacy_outcome: completion.legacyOutcome,
    next_intent: decision?.intent ?? null,
    next_tool: decision?.tool ?? null,
    next_would_handle: decision?.wouldHandle ?? null,
    capability_key: decision?.requiredCapability ?? null,
    capability_allowed: decision?.capabilityDecision?.allowed ?? null,
    capability_reason: capabilityReason(decision),
    authority_operation: decision?.authorityOperation ?? null,
    authority_allowed: decision?.authorityDecision?.allowed ?? null,
    authority_reason: decision?.authorityOperation && !decision.authorityDecision
      ? "not_resolved"
      : decision?.authorityDecision?.reason ?? null,
    canonical_result_class: completion.legacyOutcome,
    audience_projection: "customer",
    fallback_observed: decision?.handoffReason === "low_confidence",
    handoff_observed: completion.legacyOutcome === "waiting_agent" || completion.legacyOutcome === "human",
    comparisons,
    divergence_codes: divergenceCodes,
    critical_mismatch: handlerMismatch || comparisons.handoff === "mismatch",
    next_error_type: preparation.nextErrorType,
    next_error_code: preparation.nextErrorCode,
    legacy_duration_ms: Math.max(0, Math.round(completion.legacyDurationMs)),
    next_duration_ms: Math.max(0, Math.round(preparation.nextDurationMs)),
    duplicate_side_effect_prevented: preparation.duplicateSideEffectPrevented,
  };
}

export function sanitizedShadowError(error: unknown) {
  return {
    type: error instanceof Error ? error.name.slice(0, 120) : typeof error,
    code: failureCode(error).slice(0, 120),
  };
}

export class IntelligenceShadowObservability {
  static async record(
    preparation: IntelligenceShadowPreparation,
    completion: IntelligenceShadowCompletion,
  ): Promise<boolean> {
    const observation = buildIntelligenceShadowObservation(preparation, completion);
    try {
      const admin = createAdminClient();
      const { error } = await admin.rpc("intelligence_record_shadow_observation_internal", {
        p_observation: observation,
      });
      if (error) throw error;
      logger.info("whatsapp.intelligence_shadow.observed", {
        requestId: observation.request_id,
        organizationId: observation.organization_id,
        storeId: observation.store_id,
        intent: observation.next_intent,
        tool: observation.next_tool,
        legacyOutcome: observation.legacy_outcome,
        divergenceCodes: observation.divergence_codes,
        criticalMismatch: observation.critical_mismatch,
        nextDurationMs: observation.next_duration_ms,
        legacyDurationMs: observation.legacy_duration_ms,
      });
      return true;
    } catch (error) {
      const safeError = sanitizedShadowError(error);
      logger.warn("whatsapp.intelligence_shadow.persistence_failed", {
        requestId: preparation.requestId,
        organizationId: preparation.organizationId,
        storeId: preparation.storeId,
        errorType: safeError.type,
        errorCode: safeError.code,
      });
      return false;
    }
  }
}
