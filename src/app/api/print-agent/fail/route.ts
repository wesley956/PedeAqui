import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { PrintQueueService } from "@/server/printing/print-queue-service";

const bodySchema = z.object({ jobId: z.string().uuid(), error: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const result = await PrintQueueService.fail(agent, parsed.data.jobId, parsed.data.error);
  return NextResponse.json({ ok: true, result });
}
