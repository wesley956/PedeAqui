import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { SubscriptionBillingContactService } from "@/server/billing/subscription-billing-contact-service";
import { SubscriptionBillingNotificationService } from "@/server/billing/subscription-billing-notification-service";
import { SubscriptionLifecycleService } from "@/server/billing/subscription-lifecycle-service";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";

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
    return Response.json({ ok: true, contacts, lifecycle, panelNotifications, ...result });
  } catch {
    return Response.json({ ok: false, error: "subscription_renewals_failed" }, { status: 500 });
  }
}