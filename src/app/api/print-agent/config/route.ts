import { NextResponse } from "next/server";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { PrintAgentConfigurationService } from "@/server/printing/print-agent-configuration-service";

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const printers = await PrintAgentConfigurationService.list(agent);
  return NextResponse.json({ printers });
}
