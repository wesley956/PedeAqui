import { NextResponse } from "next/server";
import { runCampaignWorker } from "@/server/growth/campaign-worker";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Worker não configurado." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const total = { claimed: 0, sent: 0, skipped: 0, failed: 0 };
  for (let batch = 0; batch < 4; batch += 1) {
    const result = await runCampaignWorker({ limit: 25 });
    for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key];
    if (result.claimed < 25) break;
  }
  return NextResponse.json({ ok: true, ...total }, { headers: { "Cache-Control": "no-store" } });
}
