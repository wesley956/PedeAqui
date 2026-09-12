import { NextResponse } from "next/server";
import { runConversationAutoCloseWorker } from "@/server/conversations/conversation-auto-close-worker";
import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "conversation_auto_close"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const result = await runConversationAutoCloseWorker({ limit: 100 });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
