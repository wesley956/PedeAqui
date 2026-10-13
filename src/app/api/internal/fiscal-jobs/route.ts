import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";
import { runFiscalWorker } from "@/server/fiscal/fiscal-worker";
import { resolveFiscalProvider } from "@/server/fiscal/fiscal-provider-registry";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Processa a fila de emissão e cancelamento de notas (NFC-e). Chamado pelo agendador a cada minuto. */
export async function GET(request: Request) {
  if (!(await authorizeInternalJob(request, "fiscal_jobs"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runFiscalWorker(resolveFiscalProvider, { workerId: "fiscal-cron", limit: 10 });
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ ok: false, error: "fiscal_jobs_failed" }, { status: 500 });
  }
}
