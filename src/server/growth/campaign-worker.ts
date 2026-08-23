import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { WhatsAppCloudProvider, WhatsAppProviderError, resolveWhatsAppAccessToken } from "@/server/conversations/provider";
import { recordFailure } from "@/server/observability/failure";

type Job = {
  id: string;
  organization_id: string;
  store_id: string;
  campaign_id: string;
  customer_id: string;
  customer_name_snapshot: string;
  phone_snapshot: string | null;
  attempts: number;
};

function retrySeconds(attempt: number) { return Math.min(3600, 30 * (2 ** Math.min(attempt, 6))); }

async function finish(job: Job, workerId: string, input: { status: string; providerMessageId?: string | null; errorCode?: string | null; reason?: string | null; retryAfterSeconds?: number | null }) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("campaign_finish_internal", {
    p_recipient_id: job.id, p_worker_id: workerId, p_status: input.status,
    p_provider_message_id: input.providerMessageId ?? null, p_error_code: input.errorCode ?? null,
    p_reason: input.reason ?? null, p_retry_after_seconds: input.retryAfterSeconds ?? null,
  });
  if (error) throw error;
}

async function processOne(job: Job, workerId: string) {
  const admin = createAdminClient();
  const [campaign, preference, customer, settings, channel] = await Promise.all([
    admin.from("campaigns").select("id,status,template_name,template_language,template_data,content,content_version").eq("id", job.campaign_id).eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
    admin.from("customer_marketing_preferences").select("status").eq("organization_id", job.organization_id).eq("store_id", job.store_id).eq("customer_id", job.customer_id).eq("channel", "whatsapp").maybeSingle(),
    admin.from("customers").select("name,phone_normalized").eq("id", job.customer_id).eq("organization_id", job.organization_id).is("deleted_at", null).maybeSingle(),
    admin.from("store_operational_settings").select("growth_campaigns_enabled").eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
    admin.from("store_conversation_settings").select("whatsapp_enabled,connection_status,whatsapp_phone_number_id,access_token_secret_ref").eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
  ]);
  for (const result of [campaign, preference, customer, settings, channel]) if (result.error) throw result.error;
  if (!campaign.data || !["running", "scheduled"].includes(campaign.data.status)) { await finish(job, workerId, { status: "failed_permanent", errorCode: "campaign_unavailable", reason: "Campanha encerrada ou indisponível." }); return "failed" as const; }
  if (!settings.data?.growth_campaigns_enabled) { await finish(job, workerId, { status: "failed_permanent", errorCode: "campaigns_disabled", reason: "Campanhas foram desativadas para a unidade." }); return "failed" as const; }
  if (preference.data?.status !== "consented") { await finish(job, workerId, { status: "skipped_opt_out", errorCode: "not_eligible", reason: "Consentimento ausente ou opt-out registrado antes do envio." }); return "skipped" as const; }
  if (!customer.data?.phone_normalized || customer.data.phone_normalized !== job.phone_snapshot) { await finish(job, workerId, { status: "skipped_invalid_contact", errorCode: "invalid_contact", reason: "Telefone ausente ou alterado após o snapshot." }); return "skipped" as const; }
  if (!channel.data?.whatsapp_enabled || channel.data.connection_status !== "connected" || !channel.data.whatsapp_phone_number_id || !channel.data.access_token_secret_ref) {
    await finish(job, workerId, { status: "failed_transient", errorCode: "channel_unavailable", reason: "Canal oficial indisponível; a fila tentará novamente.", retryAfterSeconds: Math.max(900, retrySeconds(job.attempts)) }); return "failed" as const;
  }
  if (!campaign.data.template_name) { await finish(job, workerId, { status: "failed_permanent", errorCode: "template_missing", reason: "Template aprovado não configurado." }); return "failed" as const; }
  const customerName = customer.data.name;

  const { data: conversation, error: resolveError } = await admin.rpc("conversation_resolve_outbound_internal", {
    p_store_id: job.store_id, p_phone_normalized: customer.data.phone_normalized, p_contact_name: customer.data.name, p_customer_id: job.customer_id,
  });
  if (resolveError) throw resolveError;
  if (!conversation?.conversation_id || !conversation.external_id) throw new Error("Campaign conversation resolution failed");
  const clientMessageId = `campaign:${job.campaign_id}:recipient:${job.id}:v${campaign.data.content_version}`;
  const body = campaign.data.content || `Campanha ${campaign.data.template_name}`;
  const { data: message, error: messageError } = await admin.rpc("conversation_create_outbound_internal", {
    p_conversation_id: conversation.conversation_id, p_body: body, p_client_message_id: clientMessageId, p_sender_type: "system", p_actor_user_id: null,
  });
  if (messageError) throw messageError;
  if (["sent", "delivered", "read"].includes(String(message?.delivery_status))) { await finish(job, workerId, { status: "sent", providerMessageId: message.external_message_id ?? null }); return "sent" as const; }

  // Releitura imediatamente antes do provider reduz a janela entre opt-out/cancelamento e envio.
  const [sendCampaign, sendPreference, sendCustomer, sendSettings, sendChannel] = await Promise.all([
    admin.from("campaigns").select("status").eq("id", job.campaign_id).eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
    admin.from("customer_marketing_preferences").select("status").eq("organization_id", job.organization_id).eq("store_id", job.store_id).eq("customer_id", job.customer_id).eq("channel", "whatsapp").maybeSingle(),
    admin.from("customers").select("phone_normalized").eq("id", job.customer_id).eq("organization_id", job.organization_id).is("deleted_at", null).maybeSingle(),
    admin.from("store_operational_settings").select("growth_campaigns_enabled").eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
    admin.from("store_conversation_settings").select("whatsapp_enabled,connection_status,whatsapp_phone_number_id,access_token_secret_ref").eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
  ]);
  for (const result of [sendCampaign, sendPreference, sendCustomer, sendSettings, sendChannel]) if (result.error) throw result.error;
  if (!sendCampaign.data || sendCampaign.data.status !== "running") { await finish(job, workerId, { status: "failed_permanent", errorCode: "campaign_canceled", reason: "Campanha cancelada antes do envio." }); return "failed" as const; }
  if (sendPreference.data?.status !== "consented") { await finish(job, workerId, { status: "skipped_opt_out", errorCode: "not_eligible", reason: "Consentimento removido antes do envio." }); return "skipped" as const; }
  if (!sendCustomer.data?.phone_normalized || sendCustomer.data.phone_normalized !== job.phone_snapshot) { await finish(job, workerId, { status: "skipped_invalid_contact", errorCode: "invalid_contact", reason: "Telefone alterado antes do envio." }); return "skipped" as const; }
  if (!sendSettings.data?.growth_campaigns_enabled) { await finish(job, workerId, { status: "failed_permanent", errorCode: "campaigns_disabled", reason: "Campanhas desativadas antes do envio." }); return "failed" as const; }
  if (!sendChannel.data?.whatsapp_enabled || sendChannel.data.connection_status !== "connected" || !sendChannel.data.whatsapp_phone_number_id || !sendChannel.data.access_token_secret_ref) {
    await finish(job, workerId, { status: "failed_transient", errorCode: "channel_unavailable", reason: "Canal oficial indisponível antes do envio.", retryAfterSeconds: Math.max(900, retrySeconds(job.attempts)) }); return "failed" as const;
  }

  try {
    const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(sendChannel.data.access_token_secret_ref));
    const templateData = campaign.data.template_data as { body_parameters?: unknown } | null;
    const approvedParameters = Array.isArray(templateData?.body_parameters) ? templateData.body_parameters : [];
    const bodyParameters = approvedParameters.map((parameter) => {
      if (parameter !== "customer_name") throw new Error("Parâmetro de template não aprovado.");
      return customerName.slice(0, 100);
    });
    const sent = await provider.sendTemplate({ phoneNumberId: sendChannel.data.whatsapp_phone_number_id, recipient: conversation.external_id, templateName: campaign.data.template_name, languageCode: campaign.data.template_language || "pt_BR", bodyParameters });
    await admin.rpc("conversation_mark_outbound_result_internal", { p_message_id: message.id, p_external_message_id: sent.externalMessageId, p_status: "sent", p_error_code: null, p_error_message: null });
    await finish(job, workerId, { status: "sent", providerMessageId: sent.externalMessageId }); return "sent" as const;
  } catch (error) {
    const retryable = error instanceof WhatsAppProviderError ? error.retryable : true;
    const code = error instanceof WhatsAppProviderError ? `provider_${error.providerCode ?? error.status}` : "campaign_send_error";
    const reason = retryable ? "Falha temporária no canal oficial; a fila tentará novamente." : "A Meta rejeitou o template ou destinatário.";
    await admin.rpc("conversation_mark_outbound_result_internal", { p_message_id: message.id, p_external_message_id: null, p_status: "failed", p_error_code: code, p_error_message: reason });
    recordFailure("whatsapp.campaign.send_failed", error, { requestId: workerId, organizationId: job.organization_id, storeId: job.store_id, campaignId: job.campaign_id });
    await finish(job, workerId, { status: retryable ? "failed_transient" : "failed_permanent", errorCode: code, reason, retryAfterSeconds: retryable ? retrySeconds(job.attempts) : null }); return "failed" as const;
  }
}

export async function runCampaignWorker(options?: { workerId?: string; limit?: number }) {
  const admin = createAdminClient();
  const workerId = options?.workerId ?? `campaign:${randomUUID()}`;
  const { data, error } = await admin.rpc("campaign_claim_internal", { p_worker_id: workerId, p_limit: Math.min(Math.max(options?.limit ?? 20, 1), 100) });
  if (error) throw error;
  const jobs = (data ?? []) as Job[];
  const result = { claimed: jobs.length, sent: 0, skipped: 0, failed: 0 };
  for (const job of jobs) {
    try {
      const status = await processOne(job, workerId);
      result[status] += 1;
    } catch (error) {
      result.failed += 1;
      try { await finish(job, workerId, { status: "failed_transient", errorCode: "worker_error", reason: "Falha temporária no processamento.", retryAfterSeconds: retrySeconds(job.attempts) }); } catch { /* lease recuperável */ }
      recordFailure("whatsapp.campaign.worker_failed", error, { requestId: workerId, organizationId: job.organization_id, storeId: job.store_id, campaignId: job.campaign_id });
    }
  }
  return result;
}
