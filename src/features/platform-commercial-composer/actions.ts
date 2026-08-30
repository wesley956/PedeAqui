"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { MODULE_KEYS, isModuleKey, type ModuleKey } from "@/modules/module-catalog";
import { PlatformCommercialComposerService, type CommercialMode } from "@/server/platform/platform-commercial-composer-service";

export type CommercialComposerActionState = { ok: boolean; message: string; totalPriceCents?: number };

const MODES = new Set<CommercialMode>(["package", "package_plus_addons", "custom"]);

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function integerValue(formData: FormData, key: string) {
  const raw = stringValue(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export async function applyCommercialCompositionAction(
  _previous: CommercialComposerActionState,
  formData: FormData,
): Promise<CommercialComposerActionState> {
  try {
    const organizationId = stringValue(formData, "organizationId");
    const storeId = stringValue(formData, "storeId");
    const planId = stringValue(formData, "planId");
    const modeRaw = stringValue(formData, "mode");
    if (!organizationId || !storeId || !planId || !MODES.has(modeRaw as CommercialMode)) {
      return { ok: false, message: "Selecione empresa, unidade, modalidade e plano." };
    }

    const selectedModules = formData.getAll("module").flatMap((value) => {
      const key = typeof value === "string" ? value : "";
      return isModuleKey(key) ? [key] : [];
    });
    const modulePrices: Partial<Record<ModuleKey, number>> = {};
    for (const key of MODULE_KEYS) {
      const cents = integerValue(formData, `price.${key}`);
      if (cents !== null) modulePrices[key] = cents;
    }

    const dueDay = integerValue(formData, "billingDueDay");
    if (dueDay !== null && (dueDay < 1 || dueDay > 28)) return { ok: false, message: "O vencimento deve ficar entre os dias 1 e 28." };
    const nextDueDate = stringValue(formData, "nextDueDate");
    const nextDueAt = nextDueDate ? `${nextDueDate}T12:00:00-03:00` : null;
    const expectedModuleRevision = integerValue(formData, "expectedModuleRevision");
    if (expectedModuleRevision === null) return { ok: false, message: "Revisão de módulos ausente. Recarregue a página." };

    const priceLocked = stringValue(formData, "priceLocked") === "on";
    const priceLockReason = stringValue(formData, "priceLockReason") || null;
    const reason = stringValue(formData, "reason") || "Composição comercial aplicada pelo ADM";
    const protocol = stringValue(formData, "protocol") || `PA-COMPOSER-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;

    const result = await PlatformCommercialComposerService.apply({
      organizationId,
      storeId,
      mode: modeRaw as CommercialMode,
      planId,
      selectedModules,
      modulePrices,
      billingDueDay: dueDay,
      nextDueAt,
      priceLocked,
      priceLockReason,
      reason,
      protocol,
      idempotencyKey: `composer:${organizationId}:${randomUUID()}`,
      expectedModuleRevision,
    }) as { total_price_cents?: number } | null;

    revalidatePath("/platform/produto");
    revalidatePath("/platform/assinaturas");
    revalidatePath("/assinatura");
    return { ok: true, message: "Composição aplicada com sucesso.", totalPriceCents: result?.total_price_cents };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao aplicar a composição.";
    return { ok: false, message: message.slice(0, 220) };
  }
}
