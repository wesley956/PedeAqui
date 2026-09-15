import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";

const uuid = z.string().uuid();

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export class PrinterConnectionManagementService {
  static async setActive(printerId: string, active: boolean) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const id = uuid.parse(printerId);
    const admin = createAdminClient();

    const { data: before, error: readError } = await admin.from("printers")
      .select("id, name, agent_id, active, connection_type, connection_address, default_copies")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) throw new Error("Impressora não encontrada nesta unidade");
    if (active && !before.agent_id && before.connection_type !== "network") {
      throw new Error("Esta impressora está desvinculada. Conecte-a novamente antes de ativar.");
    }
    if (before.active === active) return before;

    const { data, error } = await admin.from("printers")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .select("id, name, agent_id, active, connection_type, connection_address, default_copies")
      .single();
    if (error) throw error;

    await AuditService.record(context, {
      action: active ? "print.printer_activated" : "print.printer_deactivated",
      entityType: "printer",
      entityId: id,
      before,
      after: data,
    });
    return data;
  }

  static async unlink(printerId: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    const storeId = requireStore(context.storeId);
    const id = uuid.parse(printerId);
    const admin = createAdminClient();

    const { data: before, error: readError } = await admin.from("printers")
      .select("id, name, agent_id, active, connection_type, connection_address, default_copies")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (readError) throw readError;
    if (!before) throw new Error("Impressora não encontrada nesta unidade");

    const { data: routeLinks, error: linksError } = await admin.from("station_printers")
      .select("station_id, printer_id, active")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("printer_id", id);
    if (linksError) throw linksError;

    const now = new Date().toISOString();
    const { data, error } = await admin.from("printers")
      .update({ active: false, agent_id: null, status: "unknown", last_error: null, updated_at: now })
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .select("id, name, agent_id, active, connection_type, connection_address, default_copies")
      .single();
    if (error) throw error;

    if ((routeLinks ?? []).some((link) => link.active)) {
      const { error: routeError } = await admin.from("station_printers")
        .update({ active: false, updated_at: now })
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("printer_id", id);
      if (routeError) throw routeError;
    }

    await AuditService.record(context, {
      action: "print.printer_unlinked",
      entityType: "printer",
      entityId: id,
      before: { ...before, routeLinks: routeLinks ?? [] },
      after: { ...data, routesDisabled: (routeLinks ?? []).filter((link) => link.active).length },
    });
    return data;
  }
}
