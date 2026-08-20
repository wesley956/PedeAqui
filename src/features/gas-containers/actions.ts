"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { GasContainerService } from "@/server/gas/gas-container-service";

function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function integer(formData: FormData, key: string) { const value = Number(formData.get(key) ?? 0); return Number.isFinite(value) ? Math.trunc(value) : 0; }
function moneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized || "0");
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export async function createGasContainerTypeAction(formData: FormData) {
  await GasContainerService.createType({
    code: text(formData, "code"),
    name: text(formData, "name"),
    nominalWeightKg: text(formData, "nominalWeightKg") ? Number(text(formData, "nominalWeightKg").replace(",", ".")) : null,
  });
  revalidatePath("/vasilhames");
}

export async function configureGasProductAction(formData: FormData) {
  await GasContainerService.configureProduct({
    productId: text(formData, "productId"),
    containerTypeId: text(formData, "containerTypeId"),
    exchangeEnabled: formData.get("exchangeEnabled") === "on",
    containerSaleEnabled: formData.get("containerSaleEnabled") === "on",
    requireContainerChoice: formData.get("requireContainerChoice") === "on",
    containerSurchargeCents: moneyToCents(text(formData, "containerSurcharge")),
  });
  revalidatePath("/vasilhames");
}

export async function adjustGasContainerAction(formData: FormData) {
  await GasContainerService.adjust({
    containerTypeId: text(formData, "containerTypeId"),
    fullDelta: integer(formData, "fullDelta"),
    emptyDelta: integer(formData, "emptyDelta"),
    inRouteDelta: integer(formData, "inRouteDelta"),
    reason: text(formData, "reason"),
    idempotencyKey: `gas-adjust:${randomUUID()}`,
  });
  revalidatePath("/vasilhames");
}
