import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { SubscriptionBillingContactService } from "@/server/billing/subscription-billing-contact-service";
import { SubscriptionBillingNotificationService } from "@/server/billing/subscription-billing-notification-service";
import { SubscriptionLifecycleService } from "@/server/billing/subscription-lifecycle-service";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";
import { SubscriptionWhatsAppDispatcher } from "@/server/billing/subscription-whatsapp-dispatcher";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "subscription_renewals"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const contacts = await SubscriptionBillingContactService.syncMissingOrganizationEmails();
    const lifecycle = await SubscriptionLifecycleService.reconcile();
    const result = await SubscriptionPixBillingService.runRenewals();
    const panelNotifications = await SubscriptionBillingNotificationService.dispatchPanel();
    // WhatsApp is optional; its provider/configuration cannot undo PIX/panel work.
    const whatsappNotifications = await SubscriptionWhatsAppDispatcher.dispatch().catch(() => ({ errors: 1 }));
    return Response.json({ ok: true, contacts, lifecycle, panelNotifications, whatsappNotifications, ...result });
  } catch {
    return Response.json({ ok: false, error: "subscription_renewals_failed" }, { status: 500 });
  }
}
