import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { PrintQueueService } from "@/server/printing/print-queue-service";

const bodySchema = z.object({ jobId: z.string().uuid() });

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  await PrintQueueService.acknowledge(agent, parsed.data.jobId);
  return NextResponse.json({ ok: true });
}
