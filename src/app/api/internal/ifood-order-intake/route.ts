import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { runConfiguredIfoodOrderCommands } from "@/server/integrations/providers/ifood/ifood-order-command-worker";
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
    // Keep inbound polling authoritative and available even if the outbound
    // command runner has a temporary failure during staged rollout.
    const intake = await runConfiguredIfoodOrderIntake();
    let commands: Awaited<ReturnType<typeof runConfiguredIfoodOrderCommands>> | { failed: true };
    try {
      commands = await runConfiguredIfoodOrderCommands();
    } catch {
      commands = { failed: true };
    }
    return Response.json({ ok: true, ...intake, commands }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ ok: false, error: "ifood_order_intake_failed" }, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
