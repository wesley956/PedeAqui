"use server";

import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/catalog/money";
import { DeliveryService } from "@/server/delivery/delivery-service";
import { parseNeighborhoodList } from "@/server/delivery/neighborhood-bulk";

function optionalMoney(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? parseMoneyToCents(value) : null;
}

function integer(value: FormDataEntryValue | null, fallback = 0) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Expected an integer");
  return parsed;
}

function refreshSettings() {
  revalidatePath("/configuracoes/entrega");
  revalidatePath("/m/[slug]", "page");
}

export async function updateDeliveryNeighborhoodAction(formData: FormData) {
  await DeliveryService.updateNeighborhood(String(formData.get("neighborhoodId") ?? ""), {
    neighborhoodName: String(formData.get("neighborhoodName") ?? ""),
    city: String(formData.get("city") ?? ""),
    state: String(formData.get("state") ?? ""),
    feeCents: optionalMoney(formData.get("fee")) ?? 0,
    minimumOrderCents: optionalMoney(formData.get("minimumOrder")),
    additionalMinutes: integer(formData.get("additionalMinutes")),
  });
  refreshSettings();
}

/** Colar vários bairros de uma vez ("Centro; 5,00" por linha). Cria os novos e atualiza a taxa dos existentes. */
export async function bulkDeliveryNeighborhoodsAction(formData: FormData) {
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  if (city.length < 2 || state.length !== 2) return { ok: false, message: "Informe a cidade e a UF (2 letras) dos bairros." };
  const { rows, errors } = parseNeighborhoodList(String(formData.get("list") ?? ""));
  if (rows.length === 0) {
    return { ok: false, message: errors.length > 0 ? `Nenhum bairro reconhecido. Linha ${errors[0]!.line}: ${errors[0]!.reason}. Use uma linha por bairro, com a taxa no fim (ex.: Centro; 5,00).` : "Cole pelo menos um bairro, um por linha, com a taxa no fim (ex.: Centro; 5,00)." };
  }
  try {
    const result = await DeliveryService.upsertNeighborhoodsBulk({ city, state, rows: rows.map((row) => ({ name: row.name, feeCents: row.feeCents })) });
    refreshSettings();
    const parts = [`${result.created} ${result.created === 1 ? "bairro novo" : "bairros novos"}`, `${result.updated} com taxa atualizada`];
    if (result.unchanged > 0) parts.push(`${result.unchanged} sem mudança`);
    const skipped = errors.length > 0 ? ` ${errors.length} ${errors.length === 1 ? "linha ignorada" : "linhas ignoradas"}: ${errors.slice(0, 3).map((error) => `linha ${error.line} (${error.reason})`).join(", ")}${errors.length > 3 ? "…" : ""}.` : "";
    return { ok: true, message: `Pronto: ${parts.join(", ")}.${skipped}` };
  } catch {
    return { ok: false, message: "Não foi possível salvar a lista. Confira os nomes (mínimo 2 letras) e tente de novo." };
  }
}
