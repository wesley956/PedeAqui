import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWhatsAppAppSecret } from "@/server/conversations/provider";

export type WhatsAppWebhookRouting = {
  appSecret: string;
  configuredPhoneNumberIds: Set<string>;
};

export async function resolveWhatsAppWebhookRouting(phoneNumberIds: readonly string[]): Promise<WhatsAppWebhookRouting> {
  const ids = [...new Set(phoneNumberIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Webhook sem Phone Number ID.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("store_conversation_settings")
    .select("whatsapp_phone_number_id, app_secret_secret_ref, whatsapp_enabled")
    .eq("provider", "meta_cloud")
    .eq("whatsapp_enabled", true)
    .in("whatsapp_phone_number_id", ids);
  if (error) throw error;

  const configuredPhoneNumberIds = new Set<string>();
  const secrets = new Set<string>();
  for (const row of data ?? []) {
    const phoneNumberId = row.whatsapp_phone_number_id?.trim();
    if (!phoneNumberId) continue;
    configuredPhoneNumberIds.add(phoneNumberId);
    secrets.add(resolveWhatsAppAppSecret(row.app_secret_secret_ref));
  }

  if (secrets.size > 1) throw new Error("Webhook contém números associados a apps Meta diferentes.");

  // O botão “Teste” do painel da Meta pode usar metadados sintéticos que não
  // correspondem a um Phone Number ID cadastrado. Nessa situação validamos a
  // assinatura com o App Secret global e, depois, ignoramos os eventos não
  // roteáveis em vez de gerar 500 ou persistir dados de teste.
  const appSecret = secrets.size === 1 ? [...secrets][0] : resolveWhatsAppAppSecret();
  return { appSecret, configuredPhoneNumberIds };
}
