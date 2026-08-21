"use server";

import { revalidatePath } from "next/cache";
import { PrintAgentAdminService } from "@/server/printing/print-agent-admin-service";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function nullable(formData: FormData, name: string) { const value = text(formData, name); return value || null; }
function integer(formData: FormData, name: string, fallback: number) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) ? value : fallback;
}
function refresh() { revalidatePath("/configuracoes/impressoes"); }

export async function createPrintStationAction(formData: FormData) {
  await PrintConfigService.createStation({
    name: text(formData, "name"), code: text(formData, "code"),
    kind: text(formData, "kind") as "production" | "expedition" | "counter",
  });
  refresh();
}

export async function createPrinterAction(formData: FormData) {
  await PrintConfigService.createPrinter({
    name: text(formData, "name"),
    connectionType: text(formData, "connectionType") as "network" | "usb" | "bluetooth" | "system" | "cloud_agent",
    connectionAddress: nullable(formData, "connectionAddress"),
    connectionPort: nullable(formData, "connectionPort") ? integer(formData, "connectionPort", 9100) : null,
    paperWidthMm: integer(formData, "paperWidthMm", 80) as 58 | 80,
    defaultCopies: integer(formData, "defaultCopies", 1),
    agentId: nullable(formData, "agentId"),
    fallbackPrinterId: nullable(formData, "fallbackPrinterId"),
  });
  refresh();
}

export async function quickSetupDetectedPrinterAction(formData: FormData) {
  await PrintConfigService.quickSetupDetectedPrinter({
    agentId: text(formData, "agentId"),
    printerName: text(formData, "printerName"),
    paperWidthMm: integer(formData, "paperWidthMm", 80) as 58 | 80,
  });
  refresh();
}

export async function enqueuePrinterTestAction(formData: FormData) {
  await PrintQueueService.enqueueSetupTest(text(formData, "printerId"));
  refresh();
}

export async function linkStationPrinterAction(formData: FormData) {
  await PrintConfigService.linkStationPrinter(
    text(formData, "stationId"), text(formData, "printerId"),
    integer(formData, "priority", 100),
    nullable(formData, "copies") ? integer(formData, "copies", 1) : null,
  );
  refresh();
}

export async function linkProductStationAction(formData: FormData) {
  await PrintConfigService.linkProductStation(text(formData, "productId"), text(formData, "stationId"));
  refresh();
}

export type AgentCreationState = { token: string | null; name: string | null; error: string | null };
export async function createPrintAgentAction(_state: AgentCreationState, formData: FormData): Promise<AgentCreationState> {
  try {
    const result = await PrintAgentAdminService.create(text(formData, "name"));
    refresh();
    return { token: result.token, name: result.name, error: null };
  } catch {
    return { token: null, name: null, error: "Não foi possível preparar este computador para impressão. Tente novamente." };
  }
}

export async function retryPrintJobAction(formData: FormData) {
  await PrintQueueService.retry(text(formData, "jobId"));
  refresh();
}

export async function cancelPrintJobAction(formData: FormData) {
  await PrintQueueService.cancel(text(formData, "jobId"));
  refresh();
}

export async function reprintJobAction(formData: FormData) {
  await PrintQueueService.reprint(text(formData, "jobId"), text(formData, "reason"));
  refresh();
}
