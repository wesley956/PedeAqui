"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCommercialModuleProfile, isModuleKey, moduleLabel, MODULE_CATALOG } from "@/modules/module-catalog";
import { authorizeOrganization, AuthorizationError } from "@/server/access/authorize";
import { getAccessContext } from "@/server/access/context";
import { PERMISSIONS } from "@/server/access/permissions";
import {
  ModuleConfigurationConflictError,
  ModuleConfigurationError,
  ModuleConfigurationService,
  ModulePresetConfigurationError,
} from "@/server/modules/module-configuration-service";
import { ModuleAccessService } from "@/server/modules/module-access-service";

function errorCode(error: unknown) {
  if (error instanceof ModuleConfigurationConflictError) return "conflict";
  if (error instanceof ModuleConfigurationError) return error.plan.blockers[0]?.code ?? "blocked";
  if (error instanceof ModulePresetConfigurationError) return error.blockers[0]?.code ?? "blocked";
  return "failed";
}

const inlineMessages: Record<string, string> = {
  conflict: "A configuração mudou em outra aba. Atualize a página e tente novamente.",
  core_module: "Este recurso faz parte do funcionamento básico do PedeAqui e não pode ser desligado.",
  active_dependent: "Outro recurso ativo depende desta função.",
  operational_blocker: "Existe uma operação em andamento que precisa ser concluída antes desta mudança.",
  not_in_plan: "Este recurso não está disponível no plano atual.",
  unsupported_profile: "Este recurso não está disponível para este tipo de negócio.",
  permission_denied: "Você não tem permissão para alterar este recurso.",
  blocked: "Esta alteração está bloqueada pela configuração atual.",
  failed: "Não foi possível alterar o recurso agora.",
};

export type ModuleInlineActionState = { status: "idle" | "confirm" | "success" | "error"; moduleKey?: string; enabled?: boolean; message?: string };

export async function applyModuleChangeInlineAction(previous: ModuleInlineActionState, formData: FormData): Promise<ModuleInlineActionState> {
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!isModuleKey(moduleKey)) return { status: "error", message: "Recurso inválido." };
  try {
    const [preview, snapshot] = await Promise.all([ModuleConfigurationService.preview({ moduleKey, enabled }), ModuleAccessService.load()]);
    const blocker = preview.plan.blockers[0];
    if (blocker) return { status: "error", moduleKey, enabled, message: inlineMessages[blocker.code] ?? inlineMessages.blocked };
    const relatedChanges = preview.plan.changes.filter((change) => change.moduleKey !== moduleKey);
    const confirmed = previous.status === "confirm" && previous.moduleKey === moduleKey && previous.enabled === enabled;
    if (!confirmed && (!enabled || relatedChanges.length > 0)) {
      const related = relatedChanges.map((change) => `${moduleLabel(change.moduleKey, snapshot.businessType)} será ${change.enabled ? "ativado" : "desativado"}`).join(" · ");
      const base = enabled ? `Ativar ${moduleLabel(moduleKey, snapshot.businessType)}?` : `Desativar ${moduleLabel(moduleKey, snapshot.businessType)}? O histórico continuará salvo.`;
      return { status: "confirm", moduleKey, enabled, message: related ? `${base} ${related}.` : base };
    }
    await ModuleConfigurationService.apply({ moduleKey, enabled });
    revalidatePath("/", "layout");
    return { status: "success", moduleKey, enabled, message: enabled ? "Recurso ativado." : "Recurso desativado." };
  } catch (error) {
    const code = errorCode(error);
    return { status: "error", moduleKey, enabled, message: inlineMessages[code] ?? inlineMessages.failed };
  }
}

export async function requestModuleActivationAction(formData: FormData) {
  const moduleKey = String(formData.get("moduleKey") ?? "");
  if (!isModuleKey(moduleKey)) redirect("/configuracoes/modulos?error=invalid_module");

  const context = await getAccessContext();
  if (!context.storeId) redirect("/configuracoes/modulos?error=store_missing");
  try {
    await authorizeOrganization(PERMISSIONS.ORGANIZATION_MANAGE, context);
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/configuracoes/modulos?error=permission_denied");
    throw error;
  }

  const snapshot = await ModuleAccessService.load(context);
  if (snapshot.entitlementAllowedByModule.get(moduleKey) === true) {
    redirect("/configuracoes/modulos?error=already_available");
  }

  // Um adicional não pode ser aprovado isoladamente se alguma dependência paga
  // ainda estiver fora do plano. Ex.: Entregadores exige Entregas; Compras exige
  // Estoque e Fornecedores. Isso evita cobrar um módulo que não poderá funcionar.
  const missingPaidDependency = MODULE_CATALOG[moduleKey].dependencies.find(
    (dependency) => snapshot.entitlementAllowedByModule.get(dependency) === false,
  );
  if (missingPaidDependency) {
    redirect(`/configuracoes/modulos?error=dependency_not_entitled&dependency=${missingPaidDependency}`);
  }

  const admin = createAdminClient();
  const { data: feature, error: featureError } = await admin
    .from("features")
    .select("id,key,name,metadata")
    .eq("key", `module.${moduleKey}`)
    .eq("active", true)
    .maybeSingle();
  if (featureError) redirect("/configuracoes/modulos?error=request_failed");

  const metadata = (feature?.metadata ?? {}) as Record<string, unknown>;
  const price = Number(metadata.commercial_price_cents);
  if (!feature || metadata.module_key !== moduleKey || metadata.commercial_sellable !== true || !Number.isFinite(price) || price <= 0) {
    redirect("/configuracoes/modulos?error=not_sellable");
  }

  const { data: subscription, error: subscriptionError } = await admin.from("organization_subscriptions")
    .select("id,plan_id,plan_version_id,agreed_price_cents,price_currency")
    .eq("organization_id", context.organizationId)
    .in("status", ["trialing", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) redirect("/configuracoes/modulos?error=request_failed");
  if (!subscription) redirect("/configuracoes/modulos?error=subscription_missing");

  const { data: existingRequest, error: existingRequestError } = await admin.from("subscription_change_requests")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("feature_id", feature.id)
    .eq("requested_store_id", context.storeId)
    .eq("change_type", "add_on")
    .in("status", ["draft", "scheduled"])
    .limit(1)
    .maybeSingle();
  if (existingRequestError) redirect("/configuracoes/modulos?error=request_failed");
  if (existingRequest) redirect("/configuracoes/modulos?success=request_pending");

  const { data: addons, error: addonsError } = await admin.from("subscription_addons")
    .select("unit_price_cents,quantity")
    .eq("subscription_id", subscription.id)
    .eq("status", "active");
  if (addonsError) redirect("/configuracoes/modulos?error=request_failed");

  const currentAddons = (addons ?? []).reduce((sum, addon) => sum + addon.unit_price_cents * addon.quantity, 0);
  let basePrice = subscription.agreed_price_cents;
  if (basePrice == null) {
    const { data: plan, error: planError } = await admin.from("plans").select("monthly_price_cents").eq("id", subscription.plan_id).single();
    if (planError) redirect("/configuracoes/modulos?error=request_failed");
    basePrice = plan?.monthly_price_cents ?? 0;
  }

  const protocol = `MOD-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const { error } = await admin.from("subscription_change_requests").insert({
    organization_id: context.organizationId,
    subscription_id: subscription.id,
    requested_store_id: context.storeId,
    change_type: "add_on",
    status: "draft",
    current_plan_id: subscription.plan_id,
    current_plan_version_id: subscription.plan_version_id,
    feature_id: feature.id,
    feature_name_snapshot: feature.name,
    current_base_price_cents: basePrice,
    current_addons_price_cents: currentAddons,
    proposed_base_price_cents: basePrice,
    proposed_addons_price_cents: currentAddons + price,
    proposed_total_price_cents: basePrice + currentAddons + price,
    currency: subscription.price_currency ?? "BRL",
    effective_at: new Date().toISOString(),
    reason: `Solicitação de ativação do módulo ${feature.name} pelo cliente.`,
    protocol,
    created_by: context.userId,
  });
  if (error) redirect("/configuracoes/modulos?error=request_failed");

  revalidatePath("/configuracoes/modulos");
  redirect("/configuracoes/modulos?success=request_created");
}

export async function applyModuleChangeAction(formData: FormData) {
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!isModuleKey(moduleKey)) redirect("/configuracoes/modulos?error=invalid_module");
  try { await ModuleConfigurationService.apply({ moduleKey, enabled }); } catch (error) { redirect(`/configuracoes/modulos?error=${errorCode(error)}`); }
  revalidatePath("/", "layout");
  redirect("/configuracoes/modulos?success=module_updated");
}

export async function applyModulePresetAction(formData: FormData) {
  const preset = String(formData.get("preset") ?? "");
  if (preset !== "essential" && preset !== "complete") redirect("/configuracoes/modulos?error=invalid_preset");
  try { await ModuleConfigurationService.applyPreset({ preset }); } catch (error) { redirect(`/configuracoes/modulos?error=${errorCode(error)}`); }
  revalidatePath("/", "layout");
  redirect("/configuracoes/modulos?success=preset_updated");
}

export async function applyCommercialModuleProfileAction(formData: FormData) {
  const profile = String(formData.get("profile") ?? "");
  if (!isCommercialModuleProfile(profile)) redirect("/configuracoes/modulos?error=invalid_profile");
  try { await ModuleConfigurationService.applyCommercialProfile({ profile }); } catch (error) { redirect(`/configuracoes/modulos?error=${errorCode(error)}`); }
  revalidatePath("/", "layout");
  redirect("/configuracoes/modulos?success=profile_updated");
}
