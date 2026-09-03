"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PrintAgentAdminService } from "@/server/printing/print-agent-admin-service";
import { PrintConfigService } from "@/server/printing/print-config-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";

function text(formData: FormData, name: string) { return String(formData.get(name) ?? "").trim(); }
function nullable(formData: FormData, name: string) { const value = text(formData, name); return value || null; }
function checked(formData: FormData, name: string) { return formData.get(name) === "on"; }
function integer(formData: FormData, name: string, fallback: number) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) ? value : fallback;
}
function refresh() {
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/impressoes");
  revalidatePath("/configuracoes/impressoes/formato");
}

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
  }, text(formData, "idempotencyKey"));
  refresh();
}

export async function updatePrinterCopiesAction(formData: FormData) {
  await PrintConfigService.updatePrinterDefaultCopies(
    text(formData, "printerId"),
    integer(formData, "defaultCopies", 1),
  );
  refresh();
}

export async function saveOrderPrintPreferencesAction(formData: FormData) {
  await PrintConfigService.saveOrderPrintPreferences({
    show_customer_name: checked(formData, "showCustomerName"),
    show_customer_phone: checked(formData, "showCustomerPhone"),
    show_delivery_address: checked(formData, "showDeliveryAddress"),
    show_item_modifiers: checked(formData, "showItemModifiers"),
    show_item_notes: checked(formData, "showItemNotes"),
    show_prices: checked(formData, "showPrices"),
    show_payment: checked(formData, "showPayment"),
    show_footer: checked(formData, "showFooter"),
    footer_text: nullable(formData, "footerText"),
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
  redirect("/configuracoes/impressoes?setup=printer_ready");
}

export async function enqueuePrinterTestAction(formData: FormData) {
  await PrintQueueService.enqueueSetupTest(
    text(formData, "printerId"),
    text(formData, "idempotencyKey"),
  );
  refresh();
  redirect("/configuracoes/impressoes?test=queued");
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
    const result = await PrintAgentAdminService.create(
      text(formData, "name"),
      text(formData, "idempotencyKey"),
    );
    refresh();
    return { token: result.token, name: result.name, error: null };
  } catch {
    return { token: null, name: null, error: "Não foi possível preparar este computador para impressão. Tente novamente." };
  }
}

export async function reconnectPrintAgentAction(_state: AgentCreationState, formData: FormData): Promise<AgentCreationState> {
  try {
    const result = await PrintAgentAdminService.reconnect(
      text(formData, "agentId"),
      text(formData, "idempotencyKey"),
    );
    refresh();
    return { token: result.token, name: result.name, error: null };
  } catch {
    return { token: null, name: null, error: "Não foi possível reconectar este computador. Tente novamente." };
  }
}

export async function retryPrintJobAction(formData: FormData) {
  await PrintQueueService.retry(text(formData, "jobId"));
  refresh();
}

export async function recognizePrintedJobAction(formData: FormData) {
  if (formData.get("confirmed") !== "on") throw new Error("Confirme que o documento realmente foi impresso");
  await PrintQueueService.recognizePrinted(text(formData, "jobId"), text(formData, "reason"));
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
