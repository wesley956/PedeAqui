import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { runConfiguredIfoodOrderIntake } from "@/server/integrations/providers/ifood/ifood-order-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "ifood_order_intake"))) {
    return Response.json({ error: "unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const result = await runConfiguredIfoodOrderIntake();
    return Response.json({ ok: true, ...result }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "ifood_order_intake_failed" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
