import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";
import { OrderPixReconciliationService } from "@/server/payments/order-pix-reconciliation-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "payment_reconciliation"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [orders, subscriptions] = await Promise.all([
      OrderPixReconciliationService.runBatch(),
      SubscriptionPixBillingService.reconcilePendingCharges(),
    ]);
    return Response.json({ ok: true, orders, subscriptions });
  } catch {
    return Response.json({ ok: false, error: "payment_reconciliation_failed" }, { status: 500 });
  }
}