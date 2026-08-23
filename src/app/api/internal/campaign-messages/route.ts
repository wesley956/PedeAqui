import { NextResponse } from "next/server";
import { runCampaignWorker } from "@/server/growth/campaign-worker";
import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "campaign_messages"))) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const total = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  for (let batch = 0; batch < 4; batch += 1) {
    const result = await runCampaignWorker({ limit: 25 });
    for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key];
    if (result.claimed < 25) break;
  }
  return NextResponse.json({ ok: true, ...total }, { headers: { "Cache-Control": "no-store" } });
}
