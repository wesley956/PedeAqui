import { NextResponse } from "next/server";
import { runOrderWhatsAppNotificationWorker } from "@/server/conversations/order-notification-worker";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ error: "Worker não configurado." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const result = await runOrderWhatsAppNotificationWorker({ limit: 25 });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
