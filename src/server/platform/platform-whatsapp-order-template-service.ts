import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWhatsAppAccessToken, resolveWhatsAppGraphVersion } from "@/server/conversations/provider";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const storeIdSchema = z.string().uuid();
const TEMPLATE_NAME = "pedeaqui_atualizacao_pedido";
const TEMPLATE_LANGUAGE = "pt_BR";
const TEMPLATE_CATEGORY = "UTILITY";
const APPROVED = "APPROVED";

export type OrderTemplateState = {
  name: string;
  language: string;
  category: string | null;
  status: string;
  id: string | null;
  notificationsEnabled: boolean;
};

export class PlatformWhatsAppOrderTemplateError extends Error {
  constructor(
    public readonly code:
      | "store_not_found"
      | "whatsapp_not_connected"
      | "waba_missing"
      | "platform_token_missing"
      | "graph_version_missing"
      | "meta_unavailable"
      | "meta_rejected",
    message: string,
  ) {
    super(message);
    this.name = "PlatformWhatsAppOrderTemplateError";
  }
}

async function requireSuperAdmin() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

function platformToken() {
  if (!process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()) {
    throw new PlatformWhatsAppOrderTemplateError("platform_token_missing", "O token técnico permanente do PedeAqui não está configurado.");
  }
  if (!process.env.WHATSAPP_GRAPH_API_VERSION?.trim()) {
    throw new PlatformWhatsAppOrderTemplateError("graph_version_missing", "A versão da Graph API não está configurada.");
  }
  void resolveWhatsAppGraphVersion();
  return resolveWhatsAppAccessToken("META_SYSTEM_USER_ACCESS_TOKEN");
}

type MetaErrorPayload = { error?: { code?: number; message?: string; type?: string } };

async function graphRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const version = resolveWhatsAppGraphVersion();
  const response = await fetch(`https://graph.facebook.com/${version}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${platformToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as (T & MetaErrorPayload) | null;
  if (response.ok && payload) return payload;
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    throw new PlatformWhatsAppOrderTemplateError("meta_unavailable", "A Meta está temporariamente indisponível.");
  }
  throw new PlatformWhatsAppOrderTemplateError("meta_rejected", "A Meta recusou a operação do template de notificações.");
}

async function loadStoreContext(storeId: string) {
  await requireSuperAdmin();
  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin.from("stores")
    .select("id,organization_id,name")
    .eq("id", storeId)
    .maybeSingle();
  if (storeError) throw storeError;
  if (!store) throw new PlatformWhatsAppOrderTemplateError("store_not_found", "Unidade não encontrada.");

  const { data: settings, error: settingsError } = await admin.from("store_conversation_settings")
    .select("whatsapp_enabled,connection_status,whatsapp_business_account_id,order_notifications_enabled,order_notification_template_name,order_notification_template_language")
    .eq("store_id", storeId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings?.whatsapp_enabled || settings.connection_status !== "connected") {
    throw new PlatformWhatsAppOrderTemplateError("whatsapp_not_connected", "Conecte e valide o WhatsApp antes de preparar as notificações.");
  }
  if (!settings.whatsapp_business_account_id) {
    throw new PlatformWhatsAppOrderTemplateError("waba_missing", "A unidade não possui WABA ID configurada.");
  }
  return { admin, store, settings };
}

type MetaTemplate = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
};

async function getTemplate(wabaId: string) {
  const result = await graphRequest<{ data?: MetaTemplate[] }>(
    `${encodeURIComponent(wabaId)}/message_templates?name=${encodeURIComponent(TEMPLATE_NAME)}`,
  );
  return result.data?.find((item) => item.name === TEMPLATE_NAME && item.language === TEMPLATE_LANGUAGE) ?? null;
}

async function createTemplate(wabaId: string) {
  const body = {
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    category: TEMPLATE_CATEGORY,
    components: [
      {
        type: "BODY",
        text: "{{1}}: atualização do pedido {{2}} — {{3}}. Acompanhe seu pedido: {{4}}",
        example: {
          body_text: [[
            "Restaurante PedeAqui",
            "#123",
            "Saiu para entrega",
            "https://pedeaqui.pp.ua/m/exemplo/pedido/acompanhar",
          ]],
        },
      },
    ],
  };
  return graphRequest<{ id?: string; status?: string; category?: string }>(
    `${encodeURIComponent(wabaId)}/message_templates`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

async function persistTemplateReference(storeId: string, actorUserId: string, status: string) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const approved = status === APPROVED;
  const { error } = await admin.from("store_conversation_settings")
    .update({
      order_notification_template_name: TEMPLATE_NAME,
      order_notification_template_language: TEMPLATE_LANGUAGE,
      order_notifications_enabled: approved,
      notify_order_received: true,
      notify_payment_paid: true,
      notify_pickup_ready: true,
      notify_out_for_delivery: true,
      notify_delivered: true,
      updated_by: actorUserId,
      updated_at: now,
    })
    .eq("store_id", storeId);
  if (error) throw error;
}

function normalizeState(template: MetaTemplate | null, notificationsEnabled: boolean): OrderTemplateState {
  return {
    name: TEMPLATE_NAME,
    language: TEMPLATE_LANGUAGE,
    category: template?.category ?? null,
    status: template?.status ?? "MISSING",
    id: template?.id ?? null,
    notificationsEnabled,
  };
}

export class PlatformWhatsAppOrderTemplateService {
  static async inspect(rawStoreId: string): Promise<OrderTemplateState> {
    const storeId = storeIdSchema.parse(rawStoreId);
    const { settings } = await loadStoreContext(storeId);
    const template = await getTemplate(settings.whatsapp_business_account_id!);
    return normalizeState(template, Boolean(settings.order_notifications_enabled));
  }

  static async ensure(rawStoreId: string): Promise<OrderTemplateState> {
    const storeId = storeIdSchema.parse(rawStoreId);
    const { user } = await requireSuperAdmin();
    const { admin, store, settings } = await loadStoreContext(storeId);
    let template = await getTemplate(settings.whatsapp_business_account_id!);

    if (!template) {
      const created = await createTemplate(settings.whatsapp_business_account_id!);
      template = {
        id: created.id,
        name: TEMPLATE_NAME,
        language: TEMPLATE_LANGUAGE,
        status: created.status ?? "PENDING",
        category: created.category ?? TEMPLATE_CATEGORY,
      };
    }

    await persistTemplateReference(storeId, user.id, template.status ?? "PENDING");

    await admin.from("audit_logs").insert({
      organization_id: store.organization_id,
      store_id: storeId,
      actor_user_id: user.id,
      action: "platform.whatsapp_order_template_prepared",
      entity_type: "store_conversation_settings",
      entity_id: storeId,
      after_data: {
        template_name: TEMPLATE_NAME,
        template_language: TEMPLATE_LANGUAGE,
        template_status: template.status ?? "PENDING",
        template_category: template.category ?? TEMPLATE_CATEGORY,
        notifications_enabled: template.status === APPROVED,
      },
    });

    return normalizeState(template, template.status === APPROVED);
  }
}
