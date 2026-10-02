import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { AuditService } from "@/server/audit/audit-service";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import { CampaignTemplateValidationError, campaignTemplateInputSchema, requireApprovedCampaignTemplate, type CampaignTemplateInput } from "./campaign-template-model";

class CampaignChannelUnavailable extends CampaignTemplateValidationError {}

async function authorizedChannel(write: boolean) {
  const context = await authorize(write ? PERMISSIONS.GROWTH_CAMPAIGNS : PERMISSIONS.GROWTH_VIEW);
  await ModuleAccessService.require("growth", context);
  await ModuleAccessService.require("conversations", context);
  if (!context.storeId) throw new Error("Selecione uma unidade para configurar a campanha.");
  const admin = createAdminClient();
  if (write) {
    const { data: settings, error: settingsError } = await admin.from("store_operational_settings")
      .select("growth_campaigns_enabled").eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings?.growth_campaigns_enabled) throw new CampaignTemplateValidationError("Campanhas estão desligadas para esta unidade.");
  }
  const { data, error } = await admin.from("store_conversation_settings")
    .select("whatsapp_enabled,connection_status,whatsapp_business_account_id,access_token_secret_ref")
    .eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
  if (error) throw error;
  if (!data?.whatsapp_enabled || data.connection_status !== "connected" || !data.whatsapp_business_account_id || !data.access_token_secret_ref)
    throw new CampaignChannelUnavailable("Conecte o WhatsApp desta unidade para consultar e criar modelos.");
  let accessToken;
  try { accessToken = resolveWhatsAppAccessToken(data.access_token_secret_ref); }
  catch { throw new CampaignChannelUnavailable("Revalide a conexão do WhatsApp desta unidade para gerenciar modelos."); }
  return { context, waba: data.whatsapp_business_account_id as string, provider: new WhatsAppCloudProvider(accessToken) };
}
export class CampaignTemplateService {
  static async load() {
    // Authorization errors remain errors; provider outages are explained in the panel.
    let channel;
    try { channel = await authorizedChannel(false); }
    catch (error) {
      if (error instanceof CampaignChannelUnavailable) return { templates: [], error: error.message };
      throw error;
    }
    try { return { templates: await channel.provider.listCampaignTemplates(channel.waba), error: null }; }
    catch (error) { return { templates: [], error: safeWhatsAppFailureMessage(error) }; }
  }
  static async create(input: CampaignTemplateInput) {
    const value = campaignTemplateInputSchema.parse(input);
    const { context, provider, waba } = await authorizedChannel(true);
    const existing = (await provider.listCampaignTemplates(waba, value.name)).find(t => t.name === value.name && t.language === value.language);
    if (existing) {
      if (existing.bodyText !== value.body || existing.category !== "MARKETING" || !existing.supported)
        throw new CampaignTemplateValidationError("Esse nome já existe com outro conteúdo. Use um novo nome para esta versão.");
    }
    const result = existing ? { id: existing.id, status: existing.status } : await provider.createCampaignTemplate(waba, value);
    await AuditService.record(context, { action: "growth.campaign_template_submitted", entityType: "store_whatsapp_templates", entityId: context.storeId,
      after: { provider_template_id: result.id, name: value.name, language: value.language, status: result.status, body: value.body } });
    return result;
  }
  static async approved(name: string, language: string, usesCustomerName: boolean) {
    const { provider, waba } = await authorizedChannel(true);
    return requireApprovedCampaignTemplate(await provider.listCampaignTemplates(waba, name), name, language, usesCustomerName);
  }
}
