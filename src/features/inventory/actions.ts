"use server";

import { revalidatePath } from "next/cache";
import { InventoryService } from "@/server/inventory/inventory-service";
import { RecipeService } from "@/server/inventory/recipe-service";
import type { InventoryBaseUnit } from "@/server/inventory/values";

export type InventoryActionState = { ok: boolean; message: string | null; error: string | null };

function text(formData: FormData, key: string) { const value = formData.get(key); return typeof value === "string" ? value.trim() : ""; }
function optional(formData: FormData, key: string) { return text(formData, key) || null; }
function refresh() { revalidatePath("/estoque"); revalidatePath("/estoque/fichas"); }
function friendly(error: unknown) {
  const raw = error instanceof Error ? error.message : "Não foi possível concluir a operação de estoque.";
  const lower = raw.toLocaleLowerCase("pt-BR");
  const rules: Array<[string, string]> = [
    ["inventory movement would make stock negative", "A operação deixaria o estoque negativo e esta unidade bloqueia saldo negativo."],
    ["inventory idempotency key reused", "Esta operação já foi enviada com dados diferentes. Atualize a tela e tente novamente."],
    ["inventory reconciliation idempotency key reused", "Esta contagem já foi enviada com dados diferentes. Atualize a tela e tente novamente."],
    ["inventory item must be active in both transfer stores", "O insumo precisa estar habilitado nas duas unidades para transferir."],
    ["recipe contains duplicate inventory item", "A ficha técnica não pode repetir o mesmo insumo."],
    ["recipe inventory item is not active in store", "Todos os insumos da ficha precisam estar ativos nesta unidade."],
  ];
  for (const [needle, message] of rules) if (lower.includes(needle)) return message;
  return raw;
}

export async function createInventoryItemAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    await InventoryService.createItem({
      name: text(formData, "name"), sku: optional(formData, "sku"), baseUnit: text(formData, "baseUnit") as InventoryBaseUnit,
      minimumQuantity: text(formData, "minimumQuantity") || "0", allowNegative: formData.get("allowNegative") === "on", costInput: text(formData, "costInput"),
    });
    refresh(); return { ok: true, message: "Insumo criado.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function enableInventoryItemAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    await InventoryService.enableItem(text(formData, "inventoryItemId"), text(formData, "minimumQuantity") || "0", formData.get("allowNegative") === "on");
    refresh(); return { ok: true, message: "Insumo habilitado nesta unidade.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function updateInventoryStoreItemAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    await InventoryService.updateStoreItem({
      inventoryItemId: text(formData, "inventoryItemId"), active: formData.get("active") === "on",
      minimumQuantity: text(formData, "minimumQuantity") || "0", allowNegative: formData.get("allowNegative") === "on",
      costInput: text(formData, "costInput"), baseUnit: text(formData, "baseUnit") as InventoryBaseUnit,
    });
    refresh(); return { ok: true, message: "Configuração do insumo atualizada.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function inventoryMovementAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    await InventoryService.manualMovement({ inventoryItemId: text(formData, "inventoryItemId"), movementType: text(formData, "movementType"), quantity: text(formData, "quantity"), costInput: text(formData, "costInput"), baseUnit: text(formData, "baseUnit") as InventoryBaseUnit, reason: optional(formData, "reason"), idempotencyKey: text(formData, "idempotencyKey") });
    refresh(); return { ok: true, message: "Movimento registrado.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function inventoryTransferAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    await InventoryService.transfer({ targetStoreId: text(formData, "targetStoreId"), inventoryItemId: text(formData, "inventoryItemId"), quantity: text(formData, "quantity"), reason: text(formData, "reason"), idempotencyKey: text(formData, "idempotencyKey") });
    refresh(); return { ok: true, message: "Transferência concluída.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function inventoryReconcileAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    await InventoryService.reconcile({ inventoryItemId: text(formData, "inventoryItemId"), countedQuantity: text(formData, "countedQuantity"), reason: text(formData, "reason"), idempotencyKey: text(formData, "idempotencyKey") });
    refresh(); return { ok: true, message: "Contagem conciliada.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}

export async function createRecipeVersionAction(_previous: InventoryActionState, formData: FormData): Promise<InventoryActionState> {
  try {
    const inventoryIds = formData.getAll("inventoryItemId").map(String);
    const quantities = formData.getAll("quantity").map(String);
    if (inventoryIds.length !== quantities.length) throw new Error("Ficha técnica incompleta");
    await RecipeService.createVersion({
      targetType: text(formData, "targetType"), targetId: text(formData, "targetId"), notes: optional(formData, "notes"), effectiveAt: optional(formData, "effectiveAt"),
      items: inventoryIds.map((inventoryItemId, index) => ({ inventoryItemId, quantity: quantities[index] ?? "" })),
    });
    refresh(); return { ok: true, message: "Nova versão da ficha técnica criada.", error: null };
  } catch (error) { return { ok: false, message: null, error: friendly(error) }; }
}
