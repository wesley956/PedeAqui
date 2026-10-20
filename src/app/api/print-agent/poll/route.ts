import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePrintAgentRequest } from "@/server/printing/agent-api";
import { closeExhaustedPrintJobsThrottled } from "@/server/printing/print-queue-maintenance";
import { PrintQueueService } from "@/server/printing/print-queue-service";
import { OrderAlertBackupService } from "@/server/orders/order-alert-backup-service";

/**
 * Poll combinado do Print Agent (0.7.3+): substitui, numa única chamada,
 * `/claim` (a cada ~5s) + `/order-alerts` (a cada ~6s).
 *
 * As rotas antigas continuam existindo para agentes que ainda não atualizaram.
 * Uma falha nos alertas nunca impede a entrega dos trabalhos de impressão.
 */
const bodySchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  alerts: z.object({
    cursor: z.string().regex(/^\d+$/).nullable().optional(),
  }).nullable().optional(),
});

export async function POST(request: Request) {
  const agent = await authenticatePrintAgentRequest(request);
  if (!agent) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const alertsInput = parsed.data.alerts;
  const alertsPromise = alertsInput
    ? OrderAlertBackupService.pollForAgent(agent, alertsInput.cursor ?? null)
      .catch((error: unknown) => {
        console.error("combined poll: order alerts failed", error);
        return null;
      })
    : Promise.resolve(null);

  await closeExhaustedPrintJobsThrottled(agent);
  const [jobs, alerts] = await Promise.all([
    PrintQueueService.claim(agent, parsed.data.limit ?? 5),
    alertsPromise,
  ]);

  // `alerts: null` = não pedido ou falhou; o agente mantém o cursor e tenta no próximo ciclo.
  return NextResponse.json({ jobs, alerts });
}
