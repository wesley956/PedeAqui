import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { PrintRoutingService } from "@/server/printing/print-routing-service";

const uuid = z.string().uuid();
const stationInput = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/),
  kind: z.enum(["production", "expedition", "counter"]),
});
const printerInput = z.object({
  name: z.string().trim().min(2).max(100),
  connectionType: z.enum(["network", "usb", "bluetooth", "system", "cloud_agent"]),
  connectionAddress: z.string().trim().max(255).nullable().optional(),
  connectionPort: z.number().int().min(1).max(65535).nullable().optional(),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  defaultCopies: z.number().int().min(1).max(10),
  agentId: z.string().uuid().nullable().optional(),
  fallbackPrinterId: z.string().uuid().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.connectionType === "network" && (!value.connectionAddress || !value.connectionPort)) {
    ctx.addIssue({ code: "custom", message: "Endereço e porta são obrigatórios para impressora de rede." });
  }
});

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export class PrintConfigService {
  static async snapshot() {
    const context = await authorize(PERMISSIONS.PRINTING_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [routing, printers, agents, products] = await Promise.all([
      PrintRoutingService.listForStore(context.organizationId, storeId),
      admin.from("printers")
        .select("id, name, agent_id, connection_type, connection_address, connection_port, paper_width_mm, default_copies, active, status, last_seen_at, last_error, fallback_printer_id")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).order("name"),
      admin.from("print_agents")
        .select("id, name, active, status, version, capabilities, last_seen_at, last_error, created_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).order("name"),
      admin.from("products")
        .select("id, name, active")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).order("name"),
    ]);
    if (printers.error) throw printers.error;
    if (agents.error) throw agents.error;
    if (products.error) throw products.error;
    return { context, ...routing, printers: printers.data ?? [], agents: agents.data ?? [], products: products.data ?? [] };
  }

  static async createStation(input: z.input<typeof stationInput>) {
    const values = stationInput.parse(input);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("production_stations").insert({
      organization_id: context.organizationId, store_id: storeId, name: values.name,
      code: values.code, kind: values.kind, created_by: context.userId,
    }).select("id, name, code, kind").single();
    if (error) throw error;
    await AuditService.record(context, { action: "print.station_created", entityType: "production_station", entityId: data.id, after: data });
    return data;
  }

  static async createPrinter(input: z.input<typeof printerInput>) {
    const values = printerInput.parse(input);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    if (values.agentId) {
      const { data } = await admin.from("print_agents").select("id").eq("id", values.agentId).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
      if (!data) throw new Error("Print Agent inválido para esta unidade");
    }
    if (values.fallbackPrinterId) {
      const { data } = await admin.from("printers").select("id").eq("id", values.fallbackPrinterId).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
      if (!data) throw new Error("Impressora de fallback inválida para esta unidade");
    }
    const { data, error } = await admin.from("printers").insert({
      organization_id: context.organizationId, store_id: storeId, agent_id: values.agentId ?? null,
      name: values.name, connection_type: values.connectionType,
      connection_address: values.connectionAddress || null, connection_port: values.connectionPort ?? null,
      paper_width_mm: values.paperWidthMm, default_copies: values.defaultCopies,
      fallback_printer_id: values.fallbackPrinterId ?? null, created_by: context.userId,
    }).select("id, name, connection_type, paper_width_mm").single();
    if (error) throw error;
    await AuditService.record(context, { action: "print.printer_created", entityType: "printer", entityId: data.id, after: data });
    return data;
  }

  static async linkStationPrinter(stationId: string, printerId: string, priority: number, copies: number | null) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [station, printer] = await Promise.all([
      admin.from("production_stations").select("id").eq("id", uuid.parse(stationId)).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("printers").select("id").eq("id", uuid.parse(printerId)).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    if (!station.data || !printer.data) throw new Error("Estação ou impressora não pertence à unidade atual");
    const safePriority = z.number().int().min(0).max(10000).parse(priority);
    const safeCopies = copies === null ? null : z.number().int().min(1).max(10).parse(copies);
    const { error } = await admin.from("station_printers").upsert({
      organization_id: context.organizationId, store_id: storeId,
      station_id: station.data.id, printer_id: printer.data.id,
      priority: safePriority, copies: safeCopies, active: true,
    }, { onConflict: "station_id,printer_id" });
    if (error) throw error;
    await AuditService.record(context, { action: "print.station_printer_linked", entityType: "production_station", entityId: station.data.id, after: { printerId: printer.data.id, priority: safePriority, copies: safeCopies } });
  }

  static async linkProductStation(productId: string, stationId: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [product, station] = await Promise.all([
      admin.from("products").select("id").eq("id", uuid.parse(productId)).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle(),
      admin.from("production_stations").select("id").eq("id", uuid.parse(stationId)).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    if (!product.data || !station.data) throw new Error("Produto ou estação não pertence à unidade atual");
    const { error } = await admin.from("product_production_stations").upsert({
      organization_id: context.organizationId, store_id: storeId,
      product_id: product.data.id, station_id: station.data.id,
    }, { onConflict: "product_id,station_id" });
    if (error) throw error;
    await AuditService.record(context, { action: "print.product_station_linked", entityType: "product", entityId: product.data.id, after: { stationId: station.data.id } });
  }
}
