import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { SubscriptionLifecycleService } from "@/server/billing/subscription-lifecycle-service";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "subscription_renewals"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const lifecycle = await SubscriptionLifecycleService.reconcile();
    const result = await SubscriptionPixBillingService.runRenewals();
    return Response.json({ ok: true, lifecycle, ...result });
  } catch {
    return Response.json({ ok: false, error: "subscription_renewals_failed" }, { status: 500 });
  }
}