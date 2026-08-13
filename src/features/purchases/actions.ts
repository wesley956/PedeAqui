"use server";

import { revalidatePath } from "next/cache";
import { SupplierService } from "@/server/purchases/supplier-service";
import { PurchaseService } from "@/server/purchases/purchase-service";

export type PurchaseActionState = { ok: boolean; message: string | null; error: string | null };
function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
function optional(formData: FormData, key: string) { return text(formData, key) || null; }
function refresh() { revalidatePath("/fornecedores"); revalidatePath("/compras"); revalidatePath("/estoque"); }
function numberValue(formData: FormData, key: string, fallback = 0) { const value = Number(text(formData, key)); return Number.isFinite(value) ? value : fallback; }
function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message : "Não foi possível concluir a operação.";
  const lower = raw.toLocaleLowerCase("pt-BR");
  const rules: Array<[string, string]> = [
    ["purchase below supplier minimum order", "O total do pedido está abaixo do mínimo configurado para este fornecedor."],
    ["idempotency key reused with different payload", "Esta operação já foi enviada com outros dados. Atualize a tela e tente novamente."],
    ["received quantity exceeds ordered quantity", "A quantidade recebida ultrapassa o que foi pedido."],
    ["purchase order item snapshots are locked", "Itens e custos do pedido ficam travados após o envio. Use recebimento/correção para registrar divergências."],
    ["duplicate", "O mesmo insumo não pode aparecer duas vezes na mesma operação."],
    ["supplier item unavailable", "Este insumo não está no catálogo ativo do fornecedor."],
  ];
  for (const [needle, message] of rules) if (lower.includes(needle)) return message;
  return raw;
}

export async function createSupplierAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try {
    await SupplierService.create({ name: text(formData,"name"), legalName: optional(formData,"legalName"), taxDocument: optional(formData,"taxDocument"), email: optional(formData,"email"), phone: optional(formData,"phone"), notes: optional(formData,"notes"), leadTimeDays: numberValue(formData,"leadTimeDays"), minimumOrder: text(formData,"minimumOrder") || "0" });
    refresh(); return { ok: true, message: "Fornecedor criado e habilitado nesta unidade.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function configureSupplierAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try {
    await SupplierService.configure({ supplierId: text(formData,"supplierId"), active: formData.get("active") === "on", leadTimeDays: numberValue(formData,"leadTimeDays"), minimumOrder: text(formData,"minimumOrder") || "0", notes: optional(formData,"notes") });
    refresh(); return { ok: true, message: "Condições do fornecedor atualizadas.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function upsertSupplierCatalogAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try {
    await SupplierService.upsertCatalog({ supplierId: text(formData,"supplierId"), inventoryItemId: text(formData,"inventoryItemId"), active: formData.get("active") === "on", preferred: formData.get("preferred") === "on", supplierSku: optional(formData,"supplierSku"), purchaseUnitLabel: text(formData,"purchaseUnitLabel"), baseUnitsPerPurchaseUnit: text(formData,"baseUnitsPerPurchaseUnit"), unitCostInput: text(formData,"unitCostInput") });
    refresh(); return { ok: true, message: "Item do fornecedor salvo.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function createPurchaseAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try {
    const ids = formData.getAll("inventoryItemId").map(String); const quantities = formData.getAll("quantity").map(String); const costs = formData.getAll("unitCostInput").map(String);
    const items = ids.map((inventoryItemId,index) => ({ inventoryItemId, quantity: (quantities[index] ?? "").trim(), unitCostInput: (costs[index] ?? "").trim() })).filter((item) => item.quantity && item.quantity !== "0");
    await PurchaseService.create({ supplierId: text(formData,"supplierId"), items, expectedAt: optional(formData,"expectedAt"), notes: optional(formData,"notes"), idempotencyKey: text(formData,"idempotencyKey") });
    refresh(); return { ok: true, message: "Pedido de compra criado em rascunho.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function sendPurchaseAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try { await PurchaseService.send(text(formData,"purchaseOrderId")); refresh(); return { ok: true, message: "Pedido marcado como enviado ao fornecedor.", error: null }; }
  catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function cancelPurchaseAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try { await PurchaseService.cancel(text(formData,"purchaseOrderId"), text(formData,"reason")); refresh(); return { ok: true, message: "Pedido de compra cancelado.", error: null }; }
  catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function receivePurchaseAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try {
    const ids = formData.getAll("purchaseOrderItemId").map(String); const quantities = formData.getAll("quantity").map(String); const costs = formData.getAll("unitCostInput").map(String);
    const items = ids.map((purchaseOrderItemId,index) => ({ purchaseOrderItemId, quantity: (quantities[index] ?? "").trim(), unitCostInput: (costs[index] ?? "").trim() })).filter((item) => item.quantity && item.quantity !== "0");
    await PurchaseService.receive({ orderId: text(formData,"purchaseOrderId"), items, reference: optional(formData,"reference"), notes: optional(formData,"notes"), idempotencyKey: text(formData,"idempotencyKey") });
    refresh(); return { ok: true, message: "Recebimento registrado e estoque atualizado.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function correctPurchaseReceiptAction(_previous: PurchaseActionState, formData: FormData): Promise<PurchaseActionState> {
  try {
    const ids = formData.getAll("purchaseOrderItemId").map(String); const deltas = formData.getAll("quantityDelta").map(String); const costs = formData.getAll("unitCostInput").map(String);
    const items = ids.map((purchaseOrderItemId,index) => ({ purchaseOrderItemId, quantityDelta: (deltas[index] ?? "").trim(), unitCostInput: (costs[index] ?? "").trim() })).filter((item) => item.quantityDelta && item.quantityDelta !== "0");
    await PurchaseService.correct({ orderId: text(formData,"purchaseOrderId"), receiptId: text(formData,"receiptId"), items, reason: text(formData,"reason"), idempotencyKey: text(formData,"idempotencyKey") });
    refresh(); return { ok: true, message: "Correção registrada sem apagar o recebimento original.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}
