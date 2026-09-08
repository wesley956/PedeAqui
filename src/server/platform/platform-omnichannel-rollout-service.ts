import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import {
  assertEvidenceIsSafe,
  evaluateRolloutReadiness,
  type RolloutEvidence,
  type RolloutProvider,
  type RolloutReadiness,
  type RolloutScenario,
  type RolloutTarget,
} from "@/server/integrations/rollout/rollout-gate";
import {
  generalRolloutApprovalsForStore,
  productionCapabilityApprovalsForStore,
  withGeneralRolloutApproval,
  withProductionCapabilityApproval,
} from "@/server/integrations/rollout/production-capability-approval";

type AuditRow = {
  metadata: unknown;
  created_at: string;
};

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function integer(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function evidenceFromAudit(row: AuditRow): RolloutEvidence | null {
  const value = objectValue(row.metadata);
  const scenario = value.scenario;
  const provider = value.provider;
  if (typeof scenario !== "string" || typeof provider !== "string") return null;
  const allowedScenarios: RolloutScenario[] = [
    "native_baseline",
    "core_resilience",
    "structural_integrity",
    "provider_sandbox",
    "official_homologation",
    "security",
    "canary_observation",
    "rollback_verified",
  ];
  if (!allowedScenarios.includes(scenario as RolloutScenario)) return null;
  if (provider !== "ifood" && provider !== "99food" && provider !== "99entrega") return null;
  const duplicates = objectValue(value.duplicates);
  return {
    scenario: scenario as RolloutScenario,
    passed: value.passed === true,
    environment: value.environment === "production" ? "production" : "sandbox",
    buildCommit: typeof value.build_commit === "string" ? value.build_commit : "",
    evidenceRef: typeof value.evidence_ref === "string" ? value.evidence_ref : "",
    provider: provider as RolloutProvider,
    capability: typeof value.capability === "string" ? value.capability : "",
    storeId: typeof value.store_id === "string" ? value.store_id : "",
    merchantRefSanitized: typeof value.merchant_ref_sanitized === "string" ? value.merchant_ref_sanitized : null,
    externalOrderRefSanitized: typeof value.external_order_ref_sanitized === "string" ? value.external_order_ref_sanitized : null,
    internalOrderId: typeof value.internal_order_id === "string" ? value.internal_order_id : null,
    eventTypes: stringArray(value.event_types),
    actions: stringArray(value.actions),
    printJobId: typeof value.print_job_id === "string" ? value.print_job_id : null,
    divergenceCount: integer(value.divergence_count),
    duplicates: {
      orders: integer(duplicates.orders),
      prints: integer(duplicates.prints),
      charges: integer(duplicates.charges),
      deliveries: integer(duplicates.deliveries),
    },
    nativeIsolationPassed: value.native_isolation_passed === true,
    tenantIsolationPassed: value.tenant_isolation_passed === true,
    recordedAt: row.created_at,
  };
}

function assertSuperAdmin(role: "super_admin" | "support"): void {
  if (role !== "super_admin") throw new Error("Apenas super admin pode aprovar ou alterar rollout de produção.");
}

function assertApprovalReference(value: string): string {
  const clean = value.trim();
  if (clean.length < 6 || clean.length > 160) throw new Error("Referência de aprovação explícita inválida.");
  if (/(token|secret|password|authorization|payload|customer|phone|email|address)/i.test(clean)) {
    throw new Error("Referência de aprovação contém conteúdo proibido.");
  }
  return clean;
}

export class PlatformOmnichannelRolloutService {
  static async loadReadiness(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: RolloutProvider;
    capability: string;
    target: RolloutTarget;
  }): Promise<RolloutReadiness & { canaryApproved: boolean; generalApproved: boolean }> {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const account = await admin.from("integration_accounts")
      .select("id,organization_id,provider,environment,metadata")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", input.provider)
      .single();
    if (account.error) throw account.error;

    const audit = await admin.from("integration_audit_log")
      .select("metadata,created_at")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("integration_account_id", input.integrationAccountId)
      .eq("provider", input.provider)
      .eq("capability", input.capability)
      .eq("action", "rollout_evidence_recorded")
      .order("created_at", { ascending: true });
    if (audit.error) throw audit.error;

    const evidence = (audit.data ?? [])
      .map((row) => evidenceFromAudit(row as AuditRow))
      .filter((row): row is RolloutEvidence => row !== null);
    const readiness = evaluateRolloutReadiness({
      provider: input.provider,
      capability: input.capability,
      storeId: input.storeId,
      target: input.target,
      evidence,
    });
    return {
      ...readiness,
      canaryApproved: productionCapabilityApprovalsForStore(account.data.metadata, input.storeId)[input.capability] === true,
      generalApproved: generalRolloutApprovalsForStore(account.data.metadata, input.storeId)[input.capability] === true,
    };
  }

  static async recordEvidence(input: {
    organizationId: string;
    integrationAccountId: string;
    evidence: RolloutEvidence;
  }): Promise<void> {
    const { user, role } = await PlatformAdminService.access();
    assertSuperAdmin(role);
    assertEvidenceIsSafe(input.evidence);
    const admin = createAdminClient();
    const account = await admin.from("integration_accounts")
      .select("id,provider")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", input.evidence.provider)
      .single();
    if (account.error) throw account.error;
    const merchant = await admin.from("integration_merchants")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.evidence.storeId)
      .eq("integration_account_id", input.integrationAccountId)
      .eq("provider", input.evidence.provider)
      .maybeSingle();
    if (merchant.error) throw merchant.error;
    if (!merchant.data) throw new Error("A evidência deve pertencer a uma loja vinculada ao account/provider informado.");

    const insert = await admin.from("integration_audit_log").insert({
      organization_id: input.organizationId,
      store_id: input.evidence.storeId,
      integration_account_id: input.integrationAccountId,
      actor_user_id: user.id,
      provider: input.evidence.provider,
      capability: input.evidence.capability,
      action: "rollout_evidence_recorded",
      source: "admin",
      correlation_id: `rollout-evidence:${crypto.randomUUID()}`,
      metadata: {
        scenario: input.evidence.scenario,
        passed: input.evidence.passed,
        environment: input.evidence.environment,
        build_commit: input.evidence.buildCommit,
        evidence_ref: input.evidence.evidenceRef,
        provider: input.evidence.provider,
        capability: input.evidence.capability,
        store_id: input.evidence.storeId,
        merchant_ref_sanitized: input.evidence.merchantRefSanitized,
        external_order_ref_sanitized: input.evidence.externalOrderRefSanitized,
        internal_order_id: input.evidence.internalOrderId,
        event_types: input.evidence.eventTypes,
        actions: input.evidence.actions,
        print_job_id: input.evidence.printJobId,
        divergence_count: input.evidence.divergenceCount,
        duplicates: input.evidence.duplicates,
        native_isolation_passed: input.evidence.nativeIsolationPassed,
        tenant_isolation_passed: input.evidence.tenantIsolationPassed,
      },
    });
    if (insert.error) throw insert.error;
  }

  static async approveProductionCanary(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: RolloutProvider;
    capability: string;
    approvalReference: string;
  }): Promise<void> {
    const { user, role } = await PlatformAdminService.access();
    assertSuperAdmin(role);
    const approvalReference = assertApprovalReference(input.approvalReference);
    const readiness = await this.loadReadiness({ ...input, target: "canary" });
    if (!readiness.ready) throw new Error(`Canário bloqueado: ${readiness.blockers.join(" ")}`);

    const admin = createAdminClient();
    const account = await admin.from("integration_accounts")
      .select("id,environment,metadata")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", input.provider)
      .single();
    if (account.error) throw account.error;
    if (account.data.environment !== "production") throw new Error("Aprovação de canário só se aplica ao account de produção.");

    const metadata = withProductionCapabilityApproval(
      account.data.metadata,
      input.storeId,
      input.capability,
      true,
    );
    const update = await admin.from("integration_accounts")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId);
    if (update.error) throw update.error;

    const audit = await admin.from("integration_audit_log").insert({
      organization_id: input.organizationId,
      store_id: input.storeId,
      integration_account_id: input.integrationAccountId,
      actor_user_id: user.id,
      provider: input.provider,
      capability: input.capability,
      action: "production_canary_approved",
      source: "admin",
      correlation_id: `rollout-canary:${crypto.randomUUID()}`,
      metadata: { approval_reference: approvalReference, activation_performed: false },
    });
    if (audit.error) throw audit.error;
  }

  static async approveGeneralRollout(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: RolloutProvider;
    capability: string;
    approvalReference: string;
  }): Promise<void> {
    const { user, role } = await PlatformAdminService.access();
    assertSuperAdmin(role);
    const approvalReference = assertApprovalReference(input.approvalReference);
    const readiness = await this.loadReadiness({ ...input, target: "general" });
    if (!readiness.ready || !readiness.canaryApproved) {
      throw new Error(`Expansão geral bloqueada: ${readiness.blockers.join(" ") || "canário ainda não aprovado."}`);
    }
    const admin = createAdminClient();
    const account = await admin.from("integration_accounts")
      .select("id,metadata")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", input.provider)
      .single();
    if (account.error) throw account.error;
    const metadata = withGeneralRolloutApproval(account.data.metadata, input.storeId, input.capability, true);
    const update = await admin.from("integration_accounts")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId);
    if (update.error) throw update.error;
    const audit = await admin.from("integration_audit_log").insert({
      organization_id: input.organizationId,
      store_id: input.storeId,
      integration_account_id: input.integrationAccountId,
      actor_user_id: user.id,
      provider: input.provider,
      capability: input.capability,
      action: "general_rollout_approved",
      source: "admin",
      correlation_id: `rollout-general:${crypto.randomUUID()}`,
      metadata: { approval_reference: approvalReference, activation_performed: false },
    });
    if (audit.error) throw audit.error;
  }

  static async rollbackProductionCapability(input: {
    organizationId: string;
    storeId: string;
    integrationAccountId: string;
    provider: RolloutProvider;
    capability: string;
    reason: string;
  }): Promise<void> {
    const { user, role } = await PlatformAdminService.access();
    assertSuperAdmin(role);
    const reason = assertApprovalReference(input.reason);
    const admin = createAdminClient();
    const merchant = await admin.from("integration_merchants")
      .select("id,capabilities")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("integration_account_id", input.integrationAccountId)
      .eq("provider", input.provider)
      .single();
    if (merchant.error) throw merchant.error;
    const capabilities = objectValue(merchant.data.capabilities);
    const merchantUpdate = await admin.from("integration_merchants")
      .update({ capabilities: { ...capabilities, [input.capability]: false }, updated_at: new Date().toISOString() })
      .eq("id", merchant.data.id)
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId);
    if (merchantUpdate.error) throw merchantUpdate.error;

    const account = await admin.from("integration_accounts")
      .select("id,metadata")
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId)
      .eq("provider", input.provider)
      .single();
    if (account.error) throw account.error;
    const withoutCanary = withProductionCapabilityApproval(account.data.metadata, input.storeId, input.capability, false);
    const metadata = withGeneralRolloutApproval(withoutCanary, input.storeId, input.capability, false);
    const accountUpdate = await admin.from("integration_accounts")
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq("id", input.integrationAccountId)
      .eq("organization_id", input.organizationId);
    if (accountUpdate.error) throw accountUpdate.error;

    const audit = await admin.from("integration_audit_log").insert({
      organization_id: input.organizationId,
      store_id: input.storeId,
      integration_account_id: input.integrationAccountId,
      actor_user_id: user.id,
      provider: input.provider,
      capability: input.capability,
      action: "production_capability_rollback",
      source: "admin",
      correlation_id: `rollout-rollback:${crypto.randomUUID()}`,
      metadata: { reason, capability_enabled_after: false, history_preserved: true },
    });
    if (audit.error) throw audit.error;
  }
}
