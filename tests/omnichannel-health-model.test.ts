import { describe, expect, it } from "vitest";
import {
  classifyOmnichannelFailure,
  humanCapabilityImpact,
  incidentCandidatesForCapability,
  resolveCapabilityHealthState,
  type OmnichannelCapabilityHealth,
  type OmnichannelQueueMetrics,
} from "@/server/integrations/observability/omnichannel-health-model";

const emptyQueue: OmnichannelQueueMetrics = {
  pending: 0,
  retry: 0,
  processing: 0,
  deadLetter: 0,
  oldestOpenAt: null,
  lastSuccessAt: null,
  lastFailureKind: null,
  lastFailure: null,
};

function health(overrides: Partial<OmnichannelCapabilityHealth> = {}): OmnichannelCapabilityHealth {
  return {
    key: "ifood:account:store:ifood_orders",
    provider: "ifood",
    capability: "ifood_orders",
    organizationId: "org",
    storeId: "store",
    integrationAccountId: "account",
    enabled: true,
    environment: "sandbox",
    connectionState: "connected",
    state: "connected",
    failureKind: null,
    impact: "",
    lastHealthAt: null,
    lastEventReceivedAt: null,
    lastEventProcessedAt: null,
    ingestionLagSeconds: null,
    inbox: emptyQueue,
    outbox: emptyQueue,
    divergenceCount: 0,
    ...overrides,
  };
}

describe("omnichannel capability health", () => {
  it("keeps a disabled capability non-operational without opening an incident", () => {
    const state = resolveCapabilityHealthState({
      enabled: false,
      accountStatus: "connected",
      connectionState: "connected",
      failureKind: null,
      inbox: emptyQueue,
      outbox: emptyQueue,
      divergenceCount: 0,
    });
    const item = health({ enabled: false, state });
    expect(state).toBe("disconnected");
    expect(incidentCandidatesForCapability(item)).toEqual([]);
    expect(humanCapabilityImpact(item)).toMatch(/histórico preservado/i);
  });

  it("distinguishes provider auth, rate limit, contract, local device and internal failures", () => {
    expect(classifyOmnichannelFailure({ lastErrorKind: "token_expired" })).toBe("provider_auth");
    expect(classifyOmnichannelFailure({ lastError: "HTTP 429 Retry-After" })).toBe("provider_rate_limit");
    expect(classifyOmnichannelFailure({ lastError: "payload schema validation 422" })).toBe("provider_contract");
    expect(classifyOmnichannelFailure({ lastErrorKind: "printer_offline" })).toBe("local_device");
    expect(classifyOmnichannelFailure({ lastError: "unexpected database invariant" })).toBe("pedeaqui_internal");
  });

  it("turns revoked authentication into action_required with a stable dedupe fingerprint", () => {
    const item = health({
      connectionState: "action_required",
      state: "action_required",
      failureKind: "provider_auth",
    });
    const first = incidentCandidatesForCapability(item);
    const second = incidentCandidatesForCapability(item);
    expect(first).toHaveLength(1);
    expect(first[0]?.fingerprint).toBe("omni:ifood:store:ifood_orders:provider_auth");
    expect(second[0]?.fingerprint).toBe(first[0]?.fingerprint);
  });

  it("raises attention for dead-letter and divergence without changing other capabilities", () => {
    const inbox = { ...emptyQueue, deadLetter: 1 };
    const state = resolveCapabilityHealthState({
      enabled: true,
      accountStatus: "connected",
      connectionState: "connected",
      failureKind: null,
      inbox,
      outbox: emptyQueue,
      divergenceCount: 1,
    });
    const item = health({ state, inbox, divergenceCount: 1 });
    const incidents = incidentCandidatesForCapability(item);
    expect(state).toBe("attention");
    expect(incidents.map((candidate) => candidate.sourceKind)).toEqual(expect.arrayContaining([
      "integration_dead_letter",
      "integration_divergence",
    ]));
  });

  it("raises the iFood Orders SLA warning at five minutes and escalates after seven", () => {
    const now = Date.parse("2026-09-08T12:10:00.000Z");
    const fiveMinutes = health({
      inbox: { ...emptyQueue, pending: 1, oldestOpenAt: "2026-09-08T12:05:00.000Z" },
    });
    const eightMinutes = health({
      inbox: { ...emptyQueue, pending: 1, oldestOpenAt: "2026-09-08T12:02:00.000Z" },
    });
    expect(incidentCandidatesForCapability(fiveMinutes, now).find((row) => row.sourceKind === "integration_lag")?.severity).toBe("P2");
    expect(incidentCandidatesForCapability(eightMinutes, now).find((row) => row.sourceKind === "integration_lag")?.severity).toBe("P1");
  });
});
