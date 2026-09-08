import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rolloutService = readFileSync("src/server/platform/platform-omnichannel-rollout-service.ts", "utf8");
const settings = readFileSync("src/server/integrations/providers/ifood/ifood-integration-settings-service.ts", "utf8");
const approval = readFileSync("src/server/integrations/rollout/production-capability-approval.ts", "utf8");
const docs = readFileSync("docs/OMNICHANNEL_RELEASE_GATES.md", "utf8");

describe("#949 rollout execution contracts", () => {
  it("requires production approval for the exact store + capability", () => {
    expect(settings).toContain("isProductionCapabilityApproved(accountResult.data.metadata, storeId, input.capability)");
    expect(settings).toContain("nesta unidade");
    expect(approval).toContain("[storeId]");
    expect(approval).not.toContain("return objectValue(metadata).production_capability_approvals");
  });

  it("keeps approval separate from activation", () => {
    expect(rolloutService).toContain('action: "production_canary_approved"');
    expect(rolloutService).toContain("activation_performed: false");
    expect(rolloutService).toContain('action: "general_rollout_approved"');
    const approveCanary = rolloutService.slice(
      rolloutService.indexOf("static async approveProductionCanary"),
      rolloutService.indexOf("static async approveGeneralRollout"),
    );
    expect(approveCanary).not.toContain('.from("integration_merchants")\n      .update');
  });

  it("restricts evidence/approval/rollback to super admin and audit log", () => {
    expect(rolloutService).toContain("assertSuperAdmin(role)");
    expect(rolloutService).toContain('.from("integration_audit_log")');
    expect(rolloutService).toContain('action: "rollout_evidence_recorded"');
    expect(rolloutService).toContain('source: "admin"');
  });

  it("rolls back store capability before revoking rollout approvals and preserves history", () => {
    const rollback = rolloutService.slice(rolloutService.indexOf("static async rollbackProductionCapability"));
    const capabilityOff = rollback.indexOf("[input.capability]: false");
    const approvalOff = rollback.indexOf("withProductionCapabilityApproval");
    expect(capabilityOff).toBeGreaterThan(-1);
    expect(approvalOff).toBeGreaterThan(capabilityOff);
    expect(rollback).toContain("history_preserved: true");
    expect(rollback).not.toContain('.from("external_orders").delete');
    expect(rollback).not.toContain('.from("orders").delete');
  });

  it("documents #950, P0 duplicate stop and real sandbox evidence as non-negotiable gates", () => {
    expect(docs).toContain("structural_integrity");
    expect(docs).toContain("Dona Maria 3 ↔ 4 cards");
    expect(docs).toContain("blocker P0");
    expect(docs).toContain("Mocks e fixtures fabricadas não satisfazem");
    expect(docs).toContain("iFood Catalog permanece fora do rollout");
  });

  it("locks the current official iFood Orders/Events homologation flow into the release checklist", () => {
    for (const expected of [
      "30 segundos",
      "ACK dos eventos recebidos",
      "readyToPickup",
      "dispatch",
      "confirmação",
      "cancelamento",
      "conclusão",
      "plataforma de negociação",
      "rate limits",
      "webhook com polling como fallback",
    ]) {
      expect(docs).toContain(expected);
    }
    expect(docs).toContain("não reintroduz sincronização de catálogo");
  });
});
