"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const crmSchema = z.object({
  leadId: z.string().uuid().nullable(),
  organizationId: z.string().uuid().nullable(),
  contactName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).nullable(),
  email: z.string().trim().email().max(254).nullable(),
  source: z.string().trim().min(2).max(80),
  stage: z.enum(["new", "contacted", "demo", "proposal", "won", "lost"]),
  estimatedMonthlyCents: z.number().int().min(0).max(100_000_000).nullable(),
  nextActionAt: z.string().datetime().nullable(),
  notes: z.string().trim().max(4000).nullable(),
  lostReason: z.string().trim().max(1000).nullable(),
});

const activitySchema = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(["note", "call", "whatsapp", "email", "demo", "proposal", "follow_up"]),
  summary: z.string().trim().min(3).max(1000),
});

function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function optionalUuid(formData: FormData, key: string) {
  const value = optionalText(formData, key);
  return value || null;
}

function moneyToCents(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

async function requireSuperAdmin() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

export async function saveCrmLeadAction(formData: FormData) {
  const access = await requireSuperAdmin();
  const nextActionRaw = optionalText(formData, "nextActionAt");
  const values = crmSchema.parse({
    leadId: optionalUuid(formData, "leadId"),
    organizationId: optionalUuid(formData, "organizationId"),
    contactName: String(formData.get("contactName") ?? ""),
    businessName: String(formData.get("businessName") ?? ""),
    phone: optionalText(formData, "phone"),
    email: optionalText(formData, "email"),
    source: String(formData.get("source") ?? "manual"),
    stage: String(formData.get("stage") ?? "new"),
    estimatedMonthlyCents: moneyToCents(optionalText(formData, "estimatedMonthly")),
    nextActionAt: nextActionRaw ? new Date(nextActionRaw).toISOString() : null,
    notes: optionalText(formData, "notes"),
    lostReason: optionalText(formData, "lostReason"),
  });
  const admin = createAdminClient();
  const protocol = `CRM-${Date.now().toString(36).toUpperCase()}`;
  const { error } = await admin.rpc("platform_crm_lead_save_internal", {
    p_lead_id: values.leadId,
    p_organization_id: values.organizationId,
    p_contact_name: values.contactName,
    p_business_name: values.businessName,
    p_phone: values.phone,
    p_email: values.email,
    p_source: values.source,
    p_stage: values.stage,
    p_estimated_monthly_cents: values.estimatedMonthlyCents,
    p_next_action_at: values.nextActionAt,
    p_owner_user_id: access.user.id,
    p_notes: values.notes,
    p_lost_reason: values.lostReason,
    p_actor_user_id: access.user.id,
    p_reason: values.leadId ? "Atualização do funil comercial" : "Novo lead registrado no funil comercial",
    p_protocol: protocol,
  });
  if (error) throw error;
  revalidatePath("/platform/comercial");
  revalidatePath("/platform/pendencias");
}

export async function appendCrmActivityAction(formData: FormData) {
  const access = await requireSuperAdmin();
  const values = activitySchema.parse({
    leadId: String(formData.get("leadId") ?? ""),
    kind: String(formData.get("kind") ?? "note"),
    summary: String(formData.get("summary") ?? ""),
  });
  const admin = createAdminClient();
  const protocol = `CRM-ACT-${Date.now().toString(36).toUpperCase()}`;
  const { error } = await admin.rpc("platform_crm_activity_append_internal", {
    p_lead_id: values.leadId,
    p_kind: values.kind,
    p_summary: values.summary,
    p_actor_user_id: access.user.id,
    p_reason: "Interação registrada no funil comercial",
    p_protocol: protocol,
    p_metadata: { source: "platform_admin" },
  });
  if (error) throw error;
  revalidatePath("/platform/comercial");
  revalidatePath("/platform/pendencias");
}
