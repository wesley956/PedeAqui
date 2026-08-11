import "server-only";

import { bearerToken } from "@/server/printing/agent-token";
import { PrintQueueService } from "@/server/printing/print-queue-service";

export async function authenticatePrintAgentRequest(request: Request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return null;
  return PrintQueueService.authenticateAgent(token);
}
