import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { PrintAgentDiagnosticService } from "@/server/printing/print-agent-diagnostic-service";
import { diagnosticReportSchema } from "@/features/printing/diagnostic-contract";

const schema = z.object({ requestId: z.string().uuid(), report: diagnosticReportSchema });
const MAX_BYTES = 32768;

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "report_too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    const status = await PrintAgentDiagnosticService.complete(agent, parsed.data.requestId, parsed.data.report);
    return NextResponse.json({ status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? "invalid_request" : "diagnostic_unavailable" }, { status: error instanceof SyntaxError ? 400 : 503 });
  } finally { reader.releaseLock(); }
}
