import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { OrderAlertBackupService } from "@/server/orders/order-alert-backup-service";

const schema = z.object({
  cursor: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const input = schema.parse(await request.json().catch(() => ({})));
    const result = await OrderAlertBackupService.pollForAgent(agent, input.cursor ?? null);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    return NextResponse.json({ error: "order_alert_poll_failed" }, { status: 500 });
  }
}
