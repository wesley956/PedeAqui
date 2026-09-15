"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PrinterConnectionManagementService } from "@/server/printing/printer-connection-management-service";

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function refresh() {
  revalidatePath("/configuracoes/impressoes");
  revalidatePath("/configuracoes/impressoes/gerenciar");
}

export async function setPrinterActiveAction(formData: FormData) {
  const printerId = text(formData, "printerId");
  const active = text(formData, "active") === "true";
  await PrinterConnectionManagementService.setActive(printerId, active);
  refresh();
  redirect(`/configuracoes/impressoes/gerenciar?status=${active ? "activated" : "deactivated"}`);
}

export async function unlinkPrinterAction(formData: FormData) {
  if (formData.get("confirmUnlink") !== "on") {
    throw new Error("Confirme o desvínculo da impressora");
  }
  await PrinterConnectionManagementService.unlink(text(formData, "printerId"));
  refresh();
  redirect("/configuracoes/impressoes/gerenciar?status=unlinked");
}
