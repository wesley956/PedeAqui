"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const BILLING_SOURCE_KEY = "billing.mercado_pago.source";

async function owner() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}
function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function nullable(form: FormData, key: string) { const value = text(form, key); return value || null; }
function protocol(prefix: string) { return `${prefix}-${Date.now().toString(36).toUpperCase()}`; }

export async function savePlatformAdminAction(formData: FormData) {
  const access = await owner();
  const email = text(formData, "email").toLowerCase();
  const role = text(formData, "role");
  const active = text(formData, "active") !== "false";
  if (!email.includes("@")) throw new Error("Informe um e-mail válido.");
  if (!["super_admin","support"].includes(role)) throw new Error("Função administrativa inválida.");
  const admin = createAdminClient();
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const target = users.data.users.find((user) => user.email?.toLowerCase() === email);
  if (!target) throw new Error("A conta precisa existir no PedeAqui antes de receber acesso à plataforma.");
  const { error } = await admin.rpc("platform_admin_save_internal", {
    p_target_user_id: target.id,p_role: role,p_active: active,p_actor_user_id: access.user.id,
    p_reason: "Gestão da equipe interna pelo Painel do Proprietário",p_protocol: protocol("PLATFORM-TEAM"),
  });
  if (error) throw error;
  revalidatePath("/platform/equipe");
  revalidatePath("/platform/auditoria");
}

export async function revokePlatformSessionsAction(formData: FormData) {
  const access = await owner();
  const userId = text(formData, "userId");
  const admin = createAdminClient();
  const { error } = await admin.rpc("platform_user_sessions_revoke_internal", {
    p_target_user_id: userId,p_actor_user_id: access.user.id,
    p_reason: "Revogação administrativa de sessões pelo Painel do Proprietário",p_protocol: protocol("SESSION-REVOKE"),
  });
  if (error) throw error;
  revalidatePath("/platform/equipe");
  revalidatePath("/platform/auditoria");
}

export async function saveOnboardingTaskAction(formData: FormData) {
  const access = await owner();
  const organizationId = text(formData, "organizationId");
  const storeId = nullable(formData, "storeId");
  const status = text(formData, "status") || "pending";
  const dueRaw = nullable(formData, "dueAt");
  const admin = createAdminClient();
  const { error } = await admin.rpc("platform_onboarding_task_save_internal", {
    p_organization_id: organizationId,p_store_id: storeId,p_step_key: text(formData, "stepKey"),p_label: text(formData, "label"),p_status: status,
    p_note: nullable(formData, "note"),p_due_at: dueRaw ? new Date(dueRaw).toISOString() : null,p_actor_user_id: access.user.id,
    p_reason: "Atualização do checklist de onboarding",p_protocol: protocol("ONBOARD"),
  });
  if (error) throw error;
  revalidatePath("/platform/onboarding");
  revalidatePath(`/platform/empresas/${organizationId}`);
}

export async function saveCustomerMessageAction(formData: FormData) {
  const access = await owner();
  const organizationId = text(formData, "organizationId");
  const status = text(formData, "status") || "draft";
  const scheduledRaw = nullable(formData, "scheduledAt");
  const admin = createAdminClient();
  const { error } = await admin.rpc("platform_customer_message_save_internal", {
    p_message_id: nullable(formData, "messageId"),p_organization_id: organizationId,p_channel: text(formData, "channel"),p_kind: text(formData, "kind"),
    p_title: text(formData, "title"),p_body: text(formData, "body"),p_status: status,p_scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
    p_actor_user_id: access.user.id,p_reason: "Mensagem administrativa preparada no Painel do Proprietário",p_protocol: protocol("MESSAGE"),
  });
  if (error) throw error;
  revalidatePath("/platform/comunicacao");
}

export async function savePlatformSettingAction(formData: FormData) {
  const access = await owner();
  const key = text(formData, "key");
  if (key === BILLING_SOURCE_KEY) throw new Error("A fonte Mercado Pago da plataforma usa o controle financeiro dedicado.");
  const type = text(formData, "valueType") || "string";
  const raw = text(formData, "value");
  let value: unknown = raw;
  if (type === "boolean") value = raw === "true";
  else if (type === "number") { const number = Number(raw); if (!Number.isFinite(number)) throw new Error("Valor numérico inválido."); value = number; }
  else if (type === "json") value = JSON.parse(raw);
  const admin = createAdminClient();
  const { error } = await admin.rpc("platform_setting_save_internal", {
    p_key: key,p_category: text(formData, "category"),p_description: text(formData, "description"),p_value: value,p_active: text(formData, "active") !== "false",
    p_actor_user_id: access.user.id,p_reason: "Configuração global atualizada pelo Painel do Proprietário",p_protocol: protocol("SETTING"),
  });
  if (error) throw error;
  revalidatePath("/platform/configuracoes");
  revalidatePath("/platform/privacidade");
}

export async function setPlatformBillingEnabledAction(formData: FormData) {
  const access = await owner();
  const enabled = text(formData, "enabled") === "true";
  const confirmation = text(formData, "confirmation").toUpperCase();
  const expected = enabled ? "ATIVAR COBRANCA" : "PAUSAR COBRANCA";
  if (confirmation !== expected) throw new Error(`Digite ${expected} para confirmar.`);

  const admin = createAdminClient();
  const { error } = await admin.rpc("platform_subscription_billing_set_enabled_internal", {
    p_enabled: enabled,
    p_actor_user_id: access.user.id,
    p_reason: enabled
      ? "Ativação explícita da cobrança automática das assinaturas PedeAqui"
      : "Pausa explícita de novas cobranças automáticas das assinaturas PedeAqui",
    p_protocol: protocol(enabled ? "BILLING-GOLIVE" : "BILLING-PAUSE"),
  });
  if (error) throw error;
  revalidatePath("/platform/produto");
  revalidatePath("/platform/configuracoes");
  revalidatePath("/platform/auditoria");
}

export async function createPrivacyRequestAction(formData: FormData) {
  const access = await owner();
  const organizationId = nullable(formData, "organizationId");
  const requestType = text(formData, "requestType");
  const reason = text(formData, "reason");
  if (!["access","export","correction","anonymization","deletion","other"].includes(requestType)) throw new Error("Tipo de solicitação inválido.");
  if (reason.length < 5) throw new Error("Descreva a solicitação.");
  const admin = createAdminClient();
  const requestProtocol = protocol("LGPD");
  const { data, error } = await admin.from("platform_privacy_requests").insert({
    organization_id: organizationId,requester_reference: nullable(formData, "requesterReference"),request_type: requestType,status: "received",legal_hold: false,
    reason,protocol: requestProtocol,created_by: access.user.id,updated_by: access.user.id,
  }).select("id").single();
  if (error) throw error;
  const { error: auditError } = await admin.from("platform_global_audit").insert({
    actor_user_id: access.user.id,action: "platform.privacy_request.created",entity_type: "platform_privacy_request",entity_id: data.id,organization_id: organizationId,
    after_data: { request_type: requestType,status: "received",protocol: requestProtocol },reason: "Solicitação de privacidade registrada",protocol: requestProtocol,
  });
  if (auditError) throw auditError;
  revalidatePath("/platform/privacidade");
  revalidatePath("/platform/auditoria");
}
