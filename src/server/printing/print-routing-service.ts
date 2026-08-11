import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export class PrintRoutingService {
  static async listForStore(organizationId: string, storeId: string) {
    const admin = createAdminClient();
    const [stations, stationPrinters, productStations] = await Promise.all([
      admin.from("production_stations")
        .select("id, name, code, kind, active, auto_print, sort_order")
        .eq("organization_id", organizationId).eq("store_id", storeId).order("sort_order"),
      admin.from("station_printers")
        .select("station_id, printer_id, priority, copies, active")
        .eq("organization_id", organizationId).eq("store_id", storeId).order("priority"),
      admin.from("product_production_stations")
        .select("product_id, station_id")
        .eq("organization_id", organizationId).eq("store_id", storeId),
    ]);
    if (stations.error) throw stations.error;
    if (stationPrinters.error) throw stationPrinters.error;
    if (productStations.error) throw productStations.error;
    return {
      stations: stations.data ?? [],
      stationPrinters: stationPrinters.data ?? [],
      productStations: productStations.data ?? [],
    };
  }

  static async productStationIds(organizationId: string, storeId: string, productId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("product_production_stations")
      .select("station_id")
      .eq("organization_id", organizationId).eq("store_id", storeId).eq("product_id", productId);
    if (error) throw error;
    return (data ?? []).map((row) => row.station_id);
  }
}
