import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "subscription_renewals"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await SubscriptionPixBillingService.runRenewals();
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ ok: false, error: "subscription_renewals_failed" }, { status: 500 });
  }
}
