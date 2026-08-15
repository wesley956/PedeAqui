import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import {
  WhatsAppCloudProvider,
  WhatsAppProviderError,
  resolveWhatsAppAccessToken,
  resolveWhatsAppAppSecret,
  resolveWhatsAppGraphVersion,
} from "@/server/conversations/provider";

const settingsSchema = z.object({
  whatsappEnabled: z.boolean(),
  phoneNumberId: z.string().trim().min(1).max(120).nullable(),
  businessAccountId: z.string().trim().min(1).max(120).nullable(),
  accessTokenSecretRef: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,100}$/).nullable(),
  appSecretSecretRef: z.string().trim().regex(/^[A-Z][A-Z0-9_]{2,100}$/).nullable(),
  botEnabled: z.boolean(),
  aiEnabled: z.boolean(),
});

export type ConversationSettingsInput = z.infer<typeof settingsSchema>;

export type WhatsAppChannelHealth = {
  status: "disabled" | "misconfigured" | "connected" | "provider_unavailable" | "invalid_credentials";
  message: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  graphVersion: string | null;
};

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para configurar Conversas.");
  return storeId;
}

const emptyHealth = (status: WhatsAppChannelHealth["status"], message: string, graphVersion: string | null = null): WhatsAppChannelHealth => ({
  status,
  message,
  displayPhoneNumber: null,
  verifiedName: null,
  qualityRating: null,
  graphVersion,
});

export class ConversationSettingsService {
  static async load() {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_conversation_settings")
      .select("whatsapp_enabled, provider, whatsapp_phone_number_id, whatsapp_business_account_id, access_token_secret_ref, app_secret_secret_ref, default_bot_enabled, ai_enabled")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async health(): Promise<WhatsAppChannelHealth> {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: settings, error } = await admin.from("store_conversation_settings")
      .select("whatsapp_enabled, provider, whatsapp_phone_number_id, access_token_secret_ref, app_secret_secret_ref")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    if (!settings?.whatsapp_enabled) return emptyHealth("disabled", "WhatsApp desabilitado nesta unidade.");
    if (settings.provider !== "meta_cloud" || !settings.whatsapp_phone_number_id || !settings.access_token_secret_ref || !settings.app_secret_secret_ref) {
      return emptyHealth("misconfigured", "Configuração incompleta do canal WhatsApp.");
    }

    let graphVersion: string;
    let accessToken: string;
    try {
      graphVersion = resolveWhatsAppGraphVersion();
      accessToken = resolveWhatsAppAccessToken(settings.access_token_secret_ref);
      resolveWhatsAppAppSecret(settings.app_secret_secret_ref);
    } catch (error) {
      return emptyHealth("misconfigured", error instanceof Error ? error.message : "Configuração do WhatsApp inválida.");
    }

    try {
      const provider = new WhatsAppCloudProvider(accessToken);
      const inspected = await provider.inspectPhoneNumber(settings.whatsapp_phone_number_id);
      return {
        status: "connected",
        message: "Credencial e Phone Number ID aceitos pela WhatsApp Cloud API.",
        displayPhoneNumber: inspected.displayPhoneNumber,
        verifiedName: inspected.verifiedName,
        qualityRating: inspected.qualityRating,
        graphVersion,
      };
    } catch (error) {
      if (error instanceof WhatsAppProviderError && !error.retryable) {
        return emptyHealth("invalid_credentials", "A Meta rejeitou a credencial ou o Phone Number ID configurado.", graphVersion);
      }
      return emptyHealth("provider_unavailable", "Não foi possível consultar a Meta agora. Tente novamente sem alterar as credenciais.", graphVersion);
    }
  }

  static async save(input: ConversationSettingsInput) {
    const values = settingsSchema.parse(input);
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    if (values.whatsappEnabled && (!values.phoneNumberId || !values.accessTokenSecretRef || !values.appSecretSecretRef)) {
      throw new Error("Para habilitar o WhatsApp, informe phone number id e referências dos dois secrets.");
    }
    if (values.aiEnabled && !values.botEnabled) throw new Error("A IA depende do bot habilitado.");

    const admin = createAdminClient();
    const row = {
      organization_id: context.organizationId,
      store_id: storeId,
      whatsapp_enabled: values.whatsappEnabled,
      provider: "meta_cloud",
      whatsapp_phone_number_id: values.phoneNumberId,
      whatsapp_business_account_id: values.businessAccountId,
      access_token_secret_ref: values.accessTokenSecretRef,
      app_secret_secret_ref: values.appSecretSecretRef,
      default_bot_enabled: values.botEnabled,
      ai_enabled: values.aiEnabled,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("store_conversation_settings")
      .upsert(row, { onConflict: "store_id" })
      .select("whatsapp_enabled, provider, whatsapp_phone_number_id, whatsapp_business_account_id, access_token_secret_ref, app_secret_secret_ref, default_bot_enabled, ai_enabled")
      .single();
    if (error) throw error;
    await AuditService.record(context, {
      action: "conversations.settings_updated",
      entityType: "store_conversation_settings",
      entityId: storeId,
      after: {
        whatsapp_enabled: data.whatsapp_enabled,
        provider: data.provider,
        whatsapp_phone_number_id: data.whatsapp_phone_number_id,
        whatsapp_business_account_id: data.whatsapp_business_account_id,
        access_token_secret_ref: data.access_token_secret_ref,
        app_secret_secret_ref: data.app_secret_secret_ref,
        default_bot_enabled: data.default_bot_enabled,
        ai_enabled: data.ai_enabled,
      },
    });
    return data;
  }
}
