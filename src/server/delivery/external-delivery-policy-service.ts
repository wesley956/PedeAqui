import "server-only";

import { z } from "zod";
import { getAccessContext } from "@/server/access/context";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = z.string().uuid();
const externallyManagedOwners = new Set(["ifood", "99food", "99entrega"]);

export type ExternalDeliveryPresentation = {
  provider: "ifood" | "99food";
  providerLabel: "iFood" | "99Food";
  logisticsOwner: "ifood" | "99food" | "99entrega";
  logisticsLabel: string;
};

function presentation(provider: unknown, logisticsOwner: unknown): ExternalDeliveryPresentation | null {
  if (provider !== "ifood" && provider !== "99food") return null;
  if (typeof logisticsOwner !== "string" || !externallyManagedOwners.has(logisticsOwner)) return null;
  return {
    provider,
    providerLabel: provider === "ifood" ? "iFood" : "99Food",
    logisticsOwner: logisticsOwner as ExternalDeliveryPresentation["logisticsOwner"],
    logisticsLabel: logisticsOwner === "ifood"
      ? "Entrega iFood"
      : logisticsOwner === "99entrega"
        ? "Entrega 99Entrega"
        : "Entrega 99Food",
  };
}

async function scopedContext() {
  const context = await getAccessContext();
  if (!context.storeId) throw new Error("Uma unidade ativa é necessária");
  return { context, storeId: context.storeId };
}

export class ExternalDeliveryPolicyService {
  static async presentationsForOrders(orderIds: readonly string[]) {
    if (orderIds.length === 0) return {} as Record<string, ExternalDeliveryPresentation>;
    const ids = [...new Set(orderIds.map((id) => uuid.parse(id)))];
    const { context, storeId } = await scopedContext();
    const admin = createAdminClient();
    const { data, error } = await admin.from("external_orders")
      .select("order_id, provider, logistics_owner")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_id", ids);
    if (error) throw error;

    const result: Record<string, ExternalDeliveryPresentation> = {};
    for (const row of data ?? []) {
      const value = presentation(row.provider, row.logistics_owner);
      if (value) result[row.order_id] = value;
    }
    return result;
  }

  static async assertInternalOwnership(orderId: string) {
    const id = uuid.parse(orderId);
    const { context, storeId } = await scopedContext();
    const admin = createAdminClient();
    const { data, error } = await admin.from("external_orders")
      .select("provider, logistics_owner")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("order_id", id)
      .maybeSingle();
    if (error) throw error;
    const external = presentation(data?.provider, data?.logistics_owner);
    if (external) {
      throw new Error(`Entrega gerenciada externamente por ${external.logisticsLabel}. Atualize o pedido pelo canal integrado.`);
    }
  }
}
