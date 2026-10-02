import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";
import { WhatsAppCloudProvider } from "@/server/conversations/provider";
import { BILLING_WHATSAPP_KINDS, billingWhatsAppContactFromMetadata, prepareBillingWhatsAppTemplate, resolveBillingWhatsAppSender } from "./subscription-whatsapp-contract";
import { sendOfficialBillingTemplate, verifyOfficialBillingNumber } from "./subscription-whatsapp-transport";

export class SubscriptionWhatsAppDispatcher {
  static async dispatch() {
    const sender = resolveBillingWhatsAppSender(process.env);
    const result = { scanned: 0, sent: 0, skipped: 0, rejected: 0, unknown: 0, errors: 0, disabled: !sender.ready };
    if (!sender.ready) return result;
    const admin = createAdminClient();
    const token = process.env[sender.tokenSecretRef]!;
    const restaurantNumber = await admin.from("store_conversation_settings").select("store_id")
      .eq("whatsapp_phone_number_id", sender.phoneNumberId).limit(1);
    if (restaurantNumber.error) throw new Error("billing_sender_check_failed");
    if (restaurantNumber.data?.length || !await verifyOfficialBillingNumber(sender.phoneNumberId, sender.businessAccountId, token)) {
      throw new Error("billing_sender_not_exclusive");
    }
    const templates = await new WhatsAppCloudProvider(token).listTemplates(sender.businessAccountId);
    const notices = await admin.from("subscription_billing_notifications")
      .select("id,organization_id,subscription_id,invoice_id,kind")
      .eq("channel", "whatsapp").eq("status", "pending").lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true }).limit(5);
    if (notices.error) throw new Error("billing_queue_read_failed");
    result.scanned = notices.data?.length ?? 0;
    for (const notice of notices.data ?? []) {
      try {
        const kind = z.enum(BILLING_WHATSAPP_KINDS).parse(notice.kind);
        const subscription = await admin.from("organization_subscriptions").select("metadata,updated_at")
          .eq("id", notice.subscription_id).eq("organization_id", notice.organization_id).maybeSingle();
        if (subscription.error || !subscription.data) throw new Error("billing_subscription_unavailable");
        const invoice = notice.invoice_id ? await admin.from("subscription_invoices").select("total_amount_cents,due_at,updated_at")
          .eq("id", notice.invoice_id).eq("organization_id", notice.organization_id).eq("subscription_id", notice.subscription_id).maybeSingle() : null;
        if (invoice?.error) throw new Error("billing_invoice_unavailable");
        const prepared = prepareBillingWhatsAppTemplate({ notificationId: notice.id, kind, sender, templates,
          contact: billingWhatsAppContactFromMetadata(subscription.data.metadata),
          amountCents: invoice?.data?.total_amount_cents ?? null, dueAt: invoice?.data?.due_at ?? null });
        if (!prepared.ready) { result.skipped++; continue; }
        const claim = await admin.rpc("claim_subscription_whatsapp", { p_notification_id: notice.id, p_organization_id: notice.organization_id,
          p_subscription_updated_at: subscription.data.updated_at, p_invoice_updated_at: invoice?.data?.updated_at ?? null });
        if (claim.error) throw new Error("billing_claim_failed");
        if (!claim.data) { result.skipped++; continue; }
        // Never repeat this POST after a throw, timeout, ambiguous success or DB failure.
        const delivery = await sendOfficialBillingTemplate(prepared, token);
        const finish = await admin.rpc("finish_subscription_whatsapp", { p_notification_id: notice.id, p_organization_id: notice.organization_id,
          p_attempt_token: claim.data, p_state: delivery.state, p_external_message_id: delivery.externalMessageId, p_result_code: delivery.code });
        if (finish.error || finish.data !== true) throw new Error("billing_finish_needs_review");
        result[delivery.state]++;
      } catch {
        // Codes/counts only: no recipient, token, provider payload or invoice details.
        result.errors++;
      }
    }
    return result;
  }

  static async reprocess(input: { notificationId: string; organizationId: string; reason: string }) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") throw new PlatformAuthorizationError();
    const parsed = z.object({ notificationId: z.string().uuid(), organizationId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(input);
    const result = await createAdminClient().rpc("reprocess_subscription_whatsapp", {
      p_notification_id: parsed.notificationId, p_organization_id: parsed.organizationId, p_actor_user_id: access.user.id, p_reason: parsed.reason,
    });
    if (result.error || result.data !== true) throw new Error("billing_reprocess_not_allowed");
  }
}
