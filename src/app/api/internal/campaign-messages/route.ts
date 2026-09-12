import { NextResponse } from "next/server";
import { runCampaignWorker } from "@/server/growth/campaign-worker";
import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "campaign_messages"))) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const admin = createAdminClient();
  const { data: scheduled, error: scheduleError } = await admin.rpc("growth_schedule_due_campaigns_internal", { p_limit: 20 });
  if (scheduleError) throw scheduleError;
  const total = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  for (let batch = 0; batch < 4; batch += 1) {
    const result = await runCampaignWorker({ limit: 25 });
    for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key];
    if (result.claimed < 25) break;
  }
  return NextResponse.json({ ok: true, scheduled, ...total }, { headers: { "Cache-Control": "no-store" } });
}
