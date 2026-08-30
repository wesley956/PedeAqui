import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import {
  CURRENT_SUBSCRIPTION_CONTRACT_VERSION,
  SubscriptionContractService,
  type ContractCommercialSnapshot,
} from "@/server/billing/subscription-contract-service";

export class SubscriptionContractAuthorizationError extends Error {
  constructor(message = "Somente o proprietário da empresa pode formalizar o contrato.") {
    super(message);
    this.name = "SubscriptionContractAuthorizationError";
  }
}

export class SubscriptionContractConfigurationError extends Error {
  constructor() {
    super("A identificação jurídica do PedeAqui ainda não foi configurada para formalização eletrônica.");
    this.name = "SubscriptionContractConfigurationError";
  }
}

type AcceptInput = {
  representativeName: string;
  representativeDocument?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class SubscriptionContractAcceptanceService {
  static async status(subscriptionId: string) {
    const snapshot = await ModuleAccessService.load();
    const admin = createAdminClient();
    const [{ identity, active, complete }, acceptanceResult] = await Promise.all([
      SubscriptionContractService.contractorIdentity(),
      admin
        .from("subscription_contract_acceptances")
        .select("id,contract_version,contract_title,protocol,representative_name,representative_email,document_sha256,accepted_at")
        .eq("organization_id", snapshot.context.organizationId)
        .eq("subscription_id", subscriptionId)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (acceptanceResult.error) throw acceptanceResult.error;
    const acceptance = acceptanceResult.data ?? null;
    const isOwner = snapshot.roleKeys.includes("owner");
    const state = !active || !complete
      ? "configuration_pending"
      : !acceptance
        ? "pending"
        : acceptance.contract_version === CURRENT_SUBSCRIPTION_CONTRACT_VERSION
          ? "accepted"
          : "needs_reacceptance";
    return {
      state,
      currentVersion: CURRENT_SUBSCRIPTION_CONTRACT_VERSION,
      acceptance,
      canAccept: isOwner && active && complete && state !== "accepted",
      isOwner,
      contractorIdentity: identity,
      contractorConfigured: active && complete,
    } as const;
  }

  static async accept(input: AcceptInput) {
    const representativeName = input.representativeName.trim();
    if (representativeName.length < 2) throw new Error("Informe o nome completo do responsável pelo aceite.");
    const representativeDocument = input.representativeDocument?.trim() || null;
    const [user, moduleSnapshot, contractor] = await Promise.all([
      requireAuthenticatedUser(),
      ModuleAccessService.load(),
      SubscriptionContractService.contractorIdentity(),
    ]);
    if (!moduleSnapshot.roleKeys.includes("owner")) throw new SubscriptionContractAuthorizationError();
    if (!contractor.complete) throw new SubscriptionContractConfigurationError();

    const admin = createAdminClient();
    const organizationId = moduleSnapshot.context.organizationId;
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("id,name,email,status")
      .eq("id", organizationId)
      .single();
    if (organizationError) throw organizationError;

    const { data: subscription, error: subscriptionError } = await admin
      .from("organization_subscriptions")
      .select("id,organization_id,plan_id,status,billing_interval,agreed_price_cents,price_currency,price_locked,billing_due_day,next_due_at,founder_slot,metadata")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;
    if (!subscription || ["canceled", "cancelled", "ended"].includes(String(subscription.status))) {
      throw new Error("Não existe uma assinatura vigente para formalizar.");
    }

    const [planResult, addonsResult, founderResult] = await Promise.all([
      admin.from("plans").select("id,key,name,monthly_price_cents,currency").eq("id", subscription.plan_id).single(),
      admin.from("subscription_addons").select("feature_name_snapshot,unit_price_cents,quantity,currency,status").eq("subscription_id", subscription.id).eq("status", "active"),
      admin.from("founder_club_memberships").select("joined_at,status").eq("organization_id", organizationId).eq("subscription_id", subscription.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const result of [planResult, addonsResult, founderResult]) if (result.error) throw result.error;
    const plan = planResult.data;
    if (!plan) throw new Error("O plano comercial da assinatura não está disponível.");
    const email = user.email?.trim() || organization.email?.trim() || "";
    if (!email) throw new Error("A conta responsável precisa ter um e-mail válido antes do aceite.");

    const commercial: ContractCommercialSnapshot = {
      organization_id: organizationId,
      organization_name: organization.name,
      subscription_id: subscription.id,
      plan_key: plan.key,
      plan_name: plan.name,
      billing_interval: subscription.billing_interval,
      price_cents: subscription.agreed_price_cents ?? plan.monthly_price_cents ?? 0,
      currency: subscription.price_currency || plan.currency || "BRL",
      billing_due_day: subscription.billing_due_day,
      next_due_at: subscription.next_due_at,
      price_locked: subscription.price_locked === true,
      founder_slot: subscription.founder_slot,
      founder_member_since: founderResult.data?.joined_at ?? null,
      addons: (addonsResult.data ?? []).map((addon) => ({
        name: addon.feature_name_snapshot,
        unit_price_cents: addon.unit_price_cents,
        quantity: addon.quantity,
        currency: addon.currency,
      })),
      modules: [...moduleSnapshot.enabledModuleKeys].sort(),
      captured_at: new Date().toISOString(),
    };
    const document = SubscriptionContractService.document(contractor.identity);
    const hash = SubscriptionContractService.sha256(document, commercial);
    const protocol = SubscriptionContractService.protocol();

    const { data: existing, error: existingError } = await admin
      .from("subscription_contract_acceptances")
      .select("id,protocol,accepted_at")
      .eq("subscription_id", subscription.id)
      .eq("contract_version", CURRENT_SUBSCRIPTION_CONTRACT_VERSION)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { alreadyAccepted: true, protocol: existing.protocol, acceptedAt: existing.accepted_at };

    const { data: inserted, error: insertError } = await admin
      .from("subscription_contract_acceptances")
      .insert({
        organization_id: organizationId,
        subscription_id: subscription.id,
        contract_version: document.version,
        contract_title: document.title,
        contract_document: document,
        commercial_snapshot: commercial,
        document_sha256: hash,
        protocol,
        accepted_by_user_id: user.id,
        representative_name: representativeName,
        representative_email: email,
        representative_document: representativeDocument,
        ip_address: input.ipAddress?.slice(0, 255) || null,
        user_agent: input.userAgent?.slice(0, 1024) || null,
      })
      .select("protocol,accepted_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        const { data: current, error: currentError } = await admin
          .from("subscription_contract_acceptances")
          .select("protocol,accepted_at")
          .eq("subscription_id", subscription.id)
          .eq("contract_version", CURRENT_SUBSCRIPTION_CONTRACT_VERSION)
          .single();
        if (currentError) throw currentError;
        return { alreadyAccepted: true, protocol: current.protocol, acceptedAt: current.accepted_at };
      }
      throw insertError;
    }
    return { alreadyAccepted: false, protocol: inserted.protocol, acceptedAt: inserted.accepted_at };
  }

  static async acceptedEvidence(subscriptionId: string) {
    const snapshot = await ModuleAccessService.load();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subscription_contract_acceptances")
      .select("contract_version,contract_title,contract_document,commercial_snapshot,document_sha256,protocol,representative_name,representative_email,representative_document,ip_address,user_agent,accepted_at")
      .eq("organization_id", snapshot.context.organizationId)
      .eq("subscription_id", subscriptionId)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
