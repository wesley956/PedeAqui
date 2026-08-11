import { NextResponse } from "next/server";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { PrintQueueService } from "@/server/printing/print-queue-service";

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  await PrintQueueService.heartbeat(agent, body);
  return NextResponse.json({ ok: true });
}
