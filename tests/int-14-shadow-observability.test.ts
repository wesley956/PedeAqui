import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  buildIntelligenceShadowObservation,
  sanitizedShadowError,
  type IntelligenceShadowPreparation,
} from "@/server/intelligence/shadow-observability";
import type { UnifiedRouterDecision } from "@/server/intelligence/unified-router";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260916003000_int14_intelligence_shadow_observability.sql");
const canonical = read("supabase/sql/217_intelligence_shadow_observability.sql");
const route = read("src/app/api/webhooks/whatsapp/route.ts");
const shadow = read("src/server/intelligence/unified-router-shadow.ts");

function decision(overrides: Partial<UnifiedRouterDecision> = {}): UnifiedRouterDecision {
  return {
    mode: "shadow",
    intent: "order_start",
    confidence: "high",
    tool: "whatsapp_order",
    requiredCapability: "canCreateOrder",
    capabilityDecision: null,
    authorityOperation: null,
    authorityDecision: null,
    wouldHandle: true,
    handoffReason: null,
    trace: ["context", "human_lock", "active_session", "intent", "capability", "authority", "adapter"],
    ...overrides,
  };
}

function preparation(overrides: Partial<IntelligenceShadowPreparation> = {}): IntelligenceShadowPreparation {
  return {
    organizationId: "11111111-1111-4111-8111-111111111111",
    storeId: "22222222-2222-4222-8222-222222222222",
    conversationId: "33333333-3333-4333-8333-333333333333",
    messageId: "44444444-4444-4444-8444-444444444444",
    requestId: "req-int14",
    correlationId: "req-int14",
    decision: decision(),
    nextDurationMs: 4.4,
    nextErrorType: null,
    nextErrorCode: null,
    duplicateSideEffectPrevented: false,
    ...overrides,
  };
}

describe("INT-14 shadow comparison", () => {
  it("compares the handler boundary without pretending unexecuted domains matched", () => {
    const observation = buildIntelligenceShadowObservation(preparation(), {
      legacyHandler: "whatsapp_order",
      legacyDecision: { intent: "order_start", tool: "whatsapp_order" },
      legacyOutcome: "outbound_recorded",
      legacyDurationMs: 18.8,
    });

    expect(observation.comparisons.tool).toBe("match");
    expect(observation.comparisons.intent).toBe("match");
    for (const dimension of ["price", "availability", "promotion", "order_status", "payment", "delivery", "growth"] as const) {
      expect(observation.comparisons[dimension]).toBe("not_observed");
    }
    expect(observation.divergence_codes).toEqual([]);
    expect(observation.critical_mismatch).toBe(false);
    expect(observation.legacy_duration_ms).toBe(19);
    expect(observation.next_duration_ms).toBe(4);
  });

  it("marks a handler divergence as critical and preserves legacy as the recorded outcome", () => {
    const observation = buildIntelligenceShadowObservation(preparation(), {
      legacyHandler: "greeting",
      legacyDecision: { intent: "unknown", tool: "fallback" },
      legacyOutcome: "outbound_recorded",
      legacyDurationMs: 12,
    });
    expect(observation.comparisons.tool).toBe("mismatch");
    expect(observation.comparisons.intent).toBe("mismatch");
    expect(observation.divergence_codes).toContain("tool_mismatch");
    expect(observation.critical_mismatch).toBe(true);
    expect(observation.canonical_result_class).toBe("outbound_recorded");
  });

  it("compares handoff/human lock and records duplicate prevention without side effects", () => {
    const observation = buildIntelligenceShadowObservation(preparation({
      duplicateSideEffectPrevented: true,
      decision: decision({
        intent: "handoff",
        tool: null,
        requiredCapability: null,
        wouldHandle: false,
        handoffReason: "human_lock",
      }),
    }), {
      legacyHandler: "none",
      legacyDecision: null,
      legacyOutcome: "human",
      legacyDurationMs: 1,
    });
    expect(observation.comparisons.tool).toBe("not_observed");
    expect(observation.comparisons.intent).toBe("not_observed");
    expect(observation.comparisons.handoff).toBe("not_observed");
    expect(observation.duplicate_side_effect_prevented).toBe(true);
    expect(observation.divergence_codes).toEqual([]);
    expect(observation.critical_mismatch).toBe(false);
  });

  it("sanitizes next-core errors to type/code and never captures the message", () => {
    const error = Object.assign(new Error("token=secret customer phone 19999999999"), { code: "NEXT_TIMEOUT" });
    expect(sanitizedShadowError(error)).toEqual({ type: "Error", code: "NEXT_TIMEOUT" });
  });
});

describe("INT-14 persistence, privacy and fail-open wiring", () => {
  it("is opt-in per store and disabled by default", () => {
    expect(migration).toContain("intelligence_shadow_mode boolean not null default false");
    expect(shadow).toContain("if (!settingsResult.data?.intelligence_shadow_mode) return null");
    expect(migration).not.toMatch(/update public\.store_conversation_settings[\s\S]*intelligence_shadow_mode\s*=\s*true/i);
  });

  it("keeps observation writes service-role-only and reads tenant scoped", () => {
    expect(migration).toContain("private.has_permission(organization_id, store_id, 'conversations.view')");
    expect(migration).toContain("revoke all on function public.intelligence_record_shadow_observation_internal(jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.intelligence_record_shadow_observation_internal(jsonb) to service_role");
    expect(migration).toContain("shadow observation message scope mismatch");
    expect(migration).toContain("cross_tenant_violation boolean not null default false check (cross_tenant_violation = false)");
  });

  it("stores only technical identifiers and bounded comparison fields", () => {
    const table = migration.slice(
      migration.indexOf("create table if not exists public.intelligence_shadow_observations"),
      migration.indexOf("create index if not exists intelligence_shadow_observations_store_time_idx"),
    );
    expect(table).not.toMatch(/message_body|phone_normalized|customer_name|address|access_token|qr_code|credential/i);
    expect(table).toContain("comparisons jsonb");
    expect(table).toContain("pg_column_size(comparisons) <= 4096");
    expect(table).toContain("expires_at timestamptz");
  });

  it("keeps canonical SQL synchronized with the dated migration", () => {
    expect(canonical).toBe(migration);
  });

  it("prepares shadow before legacy, records only after canonical inbound outcome and stays fail-open", () => {
    const prepareAt = route.indexOf("UnifiedIntelligenceRouterShadow.afterInbound");
    const legacyAt = route.indexOf("WhatsAppDirectOrderOrchestrator.afterInbound");
    const outcomeAt = route.indexOf("InboundOutcomeService.finalize");
    const recordAt = route.indexOf("IntelligenceShadowObservability.record");
    expect(prepareAt).toBeGreaterThan(-1);
    expect(legacyAt).toBeGreaterThan(prepareAt);
    expect(outcomeAt).toBeGreaterThan(legacyAt);
    expect(recordAt).toBeGreaterThan(outcomeAt);
    expect(route).toContain('recordFailure("whatsapp.intelligence_shadow.failed"');
  });
});
