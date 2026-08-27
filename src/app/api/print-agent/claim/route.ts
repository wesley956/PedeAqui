import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { closeExhaustedPrintJobs } from "@/server/printing/print-queue-maintenance";
import { PrintQueueService } from "@/server/printing/print-queue-service";

const bodySchema = z.object({ limit: z.number().int().min(1).max(20).optional() });

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  await closeExhaustedPrintJobs(agent);
  const jobs = await PrintQueueService.claim(agent, parsed.data.limit ?? 5);
  return NextResponse.json({ jobs });
}
