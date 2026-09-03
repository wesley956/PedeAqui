import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { PrintRoutingService } from "@/server/printing/print-routing-service";
import { orderPrintPreferencesSchema, resolveOrderPrintPreferences } from "@/server/printing/templates";

const uuid = z.string().uuid();
const copiesInput = z.number().int().min(1).max(10);
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
  defaultCopies: copiesInput,
  agentId: z.string().uuid().nullable().optional(),
  fallbackPrinterId: z.string().uuid().nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.connectionType === "network" && (!value.connectionAddress || !value.connectionPort)) {
    ctx.addIssue({ code: "custom", message: "Endereço e porta são obrigatórios para impressora de rede." });
  }
});
const quickDetectedPrinterInput = z.object({
  agentId: z.string().uuid(),
  printerName: z.string().trim().min(2).max(255),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
});

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

function discoveredPrinterNames(capabilities: unknown) {
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) return new Set<string>();
  const discovered = (capabilities as Record<string, unknown>).discoveredPrinters;
  if (!Array.isArray(discovered)) return new Set<string>();
  return new Set(discovered
    .map((item) => item && typeof item === "object" && !Array.isArray(item) ? String((item as Record<string, unknown>).name ?? "").trim() : "")
    .filter(Boolean));
}

export class PrintConfigService {
  static async snapshot() {
    const context = await authorize(PERMISSIONS.PRINTING_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [routing, printers, agents, products, preferences] = await Promise.all([
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
      admin.from("store_print_preferences")
        .select("show_customer_name, show_customer_phone, show_delivery_address, show_item_modifiers, show_item_notes, show_prices, show_payment, show_footer, footer_text")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
    ]);
    if (printers.error) throw printers.error;
    if (agents.error) throw agents.error;
    if (products.error) throw products.error;
    if (preferences.error) throw preferences.error;
    return {
      context,
      ...routing,
      printers: printers.data ?? [],
      agents: agents.data ?? [],
      products: products.data ?? [],
      printPreferences: resolveOrderPrintPreferences(preferences.data),
    };
  }

  static async createStation(input: z.input<typeof stationInput>) {
    const values = stationInput.parse(input);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const findExisting = () => admin.from("production_stations")
      .select("id, name, code, kind")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("code", values.code)
      .maybeSingle();
    const existingResult = await findExisting();
    if (existingResult.error) throw existingResult.error;
    if (existingResult.data) {
      if (existingResult.data.name === values.name && existingResult.data.kind === values.kind) return existingResult.data;
      throw new Error("Já existe uma estação com este código nesta unidade.");
    }

    const { data, error } = await admin.from("production_stations").insert({
      organization_id: context.organizationId, store_id: storeId, name: values.name,
      code: values.code, kind: values.kind, created_by: context.userId,
    }).select("id, name, code, kind").single();
    if (error) {
      if (error.code === "23505") {
        const replay = await findExisting();
        if (replay.error) throw replay.error;
        if (replay.data?.name === values.name && replay.data.kind === values.kind) return replay.data;
      }
      throw error;
    }
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

  static async updatePrinterDefaultCopies(printerId: string, defaultCopies: number) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const id = uuid.parse(printerId);
    const copies = copiesInput.parse(defaultCopies);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("printers")
      .select("id, name, default_copies")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;
    if (!before) throw new Error("Impressora não encontrada nesta unidade");
    if (Number(before.default_copies) === copies) return { ...before, default_copies: copies };
    const { data, error } = await admin.from("printers")
      .update({ default_copies: copies, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, name, default_copies").single();
    if (error) throw error;
    await AuditService.record(context, {
      action: "print.printer_default_copies_updated",
      entityType: "printer",
      entityId: id,
      before,
      after: data,
    });
    return data;
  }

  static async saveOrderPrintPreferences(input: z.input<typeof orderPrintPreferencesSchema>) {
    const values = orderPrintPreferencesSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("store_print_preferences")
      .select("show_customer_name, show_customer_phone, show_delivery_address, show_item_modifiers, show_item_notes, show_prices, show_payment, show_footer, footer_text")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;
    const desired = resolveOrderPrintPreferences(values);
    if (before && JSON.stringify(resolveOrderPrintPreferences(before)) === JSON.stringify(desired)) return desired;
    const row = {
      organization_id: context.organizationId,
      store_id: storeId,
      ...values,
      footer_text: values.footer_text || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("store_print_preferences")
      .upsert(row, { onConflict: "store_id" })
      .select("show_customer_name, show_customer_phone, show_delivery_address, show_item_modifiers, show_item_notes, show_prices, show_payment, show_footer, footer_text")
      .single();
    if (error) throw error;
    await AuditService.record(context, {
      action: "print.order_preferences_updated",
      entityType: "store_print_preferences",
      entityId: storeId,
      before: before ?? null,
      after: data,
    });
    return resolveOrderPrintPreferences(data);
  }

  static async quickSetupDetectedPrinter(input: z.input<typeof quickDetectedPrinterInput>) {
    const values = quickDetectedPrinterInput.parse(input);
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    let changed = false;

    const { data: agent, error: agentError } = await admin.from("print_agents")
      .select("id, name, active, capabilities")
      .eq("id", values.agentId)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent?.active) throw new Error("Computador de impressão não está ativo nesta unidade");
    if (!discoveredPrinterNames(agent.capabilities).has(values.printerName)) {
      throw new Error("A impressora escolhida não foi detectada por este computador");
    }

    const findSystemPrinter = () => admin.from("printers")
      .select("id, name, active, paper_width_mm, last_error")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("agent_id", agent.id)
      .eq("connection_type", "system")
      .eq("connection_address", values.printerName)
      .limit(1)
      .maybeSingle();
    const existingResult = await findSystemPrinter();
    if (existingResult.error) throw existingResult.error;

    let printer: { id: string; name: string };
    if (existingResult.data) {
      if (existingResult.data.active && Number(existingResult.data.paper_width_mm) === values.paperWidthMm && !existingResult.data.last_error) {
        printer = { id: existingResult.data.id, name: existingResult.data.name };
      } else {
        const { data, error } = await admin.from("printers")
          .update({ active: true, paper_width_mm: values.paperWidthMm, last_error: null, updated_at: new Date().toISOString() })
          .eq("id", existingResult.data.id)
          .eq("organization_id", context.organizationId)
          .eq("store_id", storeId)
          .select("id, name")
          .single();
        if (error) throw error;
        printer = data;
        changed = true;
      }
    } else {
      const { data, error } = await admin.from("printers").insert({
        organization_id: context.organizationId,
        store_id: storeId,
        agent_id: agent.id,
        name: values.printerName,
        connection_type: "system",
        connection_address: values.printerName,
        paper_width_mm: values.paperWidthMm,
        default_copies: 1,
        active: true,
        created_by: context.userId,
      }).select("id, name").single();
      if (error) {
        if (error.code === "23505") {
          const replay = await findSystemPrinter();
          if (replay.error) throw replay.error;
          if (!replay.data) throw error;
          printer = { id: replay.data.id, name: replay.data.name };
        } else {
          throw error;
        }
      } else {
        printer = data;
        changed = true;
      }
    }

    const findDefaultStation = () => admin.from("production_stations")
      .select("id, name, active, auto_print")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("code", "pedidos")
      .maybeSingle();
    const existingStationResult = await findDefaultStation();
    if (existingStationResult.error) throw existingStationResult.error;

    let station: { id: string; name: string };
    if (existingStationResult.data) {
      if (existingStationResult.data.active && existingStationResult.data.auto_print) {
        station = { id: existingStationResult.data.id, name: existingStationResult.data.name };
      } else {
        const { data, error } = await admin.from("production_stations")
          .update({ active: true, auto_print: true, updated_at: new Date().toISOString() })
          .eq("id", existingStationResult.data.id)
          .eq("organization_id", context.organizationId)
          .eq("store_id", storeId)
          .select("id, name")
          .single();
        if (error) throw error;
        station = data;
        changed = true;
      }
    } else {
      const { data, error } = await admin.from("production_stations").insert({
        organization_id: context.organizationId,
        store_id: storeId,
        name: "Pedidos",
        code: "pedidos",
        kind: "counter",
        active: true,
        auto_print: true,
        created_by: context.userId,
      }).select("id, name").single();
      if (error) {
        if (error.code === "23505") {
          const replay = await findDefaultStation();
          if (replay.error) throw replay.error;
          if (!replay.data) throw error;
          station = { id: replay.data.id, name: replay.data.name };
        } else {
          throw error;
        }
      } else {
        station = data;
        changed = true;
      }
    }

    const { data: currentLink, error: currentLinkError } = await admin.from("station_printers")
      .select("priority, copies, active")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("station_id", station.id)
      .eq("printer_id", printer.id)
      .maybeSingle();
    if (currentLinkError) throw currentLinkError;
    if (!currentLink || Number(currentLink.priority) !== 100 || currentLink.copies !== null || !currentLink.active) {
      const { error: linkError } = await admin.from("station_printers").upsert({
        organization_id: context.organizationId,
        store_id: storeId,
        station_id: station.id,
        printer_id: printer.id,
        priority: 100,
        copies: null,
        active: true,
      }, { onConflict: "station_id,printer_id" });
      if (linkError) throw linkError;
      changed = true;
    }

    if (changed) {
      await AuditService.record(context, {
        action: "print.quick_setup_completed",
        entityType: "printer",
        entityId: printer.id,
        after: { agentId: agent.id, printerName: printer.name, stationId: station.id, paperWidthMm: values.paperWidthMm },
      });
    }
    return { printer, station };
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
    const safeCopies = copies === null ? null : copiesInput.parse(copies);
    const { data: existing, error: readError } = await admin.from("station_printers")
      .select("priority, copies, active")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("station_id", station.data.id)
      .eq("printer_id", printer.data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (existing && Number(existing.priority) === safePriority && existing.copies === safeCopies && existing.active) return;
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
    const { data: existing, error: readError } = await admin.from("product_production_stations")
      .select("product_id")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("product_id", product.data.id)
      .eq("station_id", station.data.id)
      .maybeSingle();
    if (readError) throw readError;
    if (existing) return;
    const { error } = await admin.from("product_production_stations").insert({
      organization_id: context.organizationId, store_id: storeId,
      product_id: product.data.id, station_id: station.data.id,
    });
    if (error) {
      if (error.code === "23505") return;
      throw error;
    }
    await AuditService.record(context, { action: "print.product_station_linked", entityType: "product", entityId: product.data.id, after: { stationId: station.data.id } });
  }
}
