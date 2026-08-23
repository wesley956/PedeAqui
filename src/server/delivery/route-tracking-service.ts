import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

const uuid = z.string().uuid();
const heartbeatSchema = z.object({
  routeSessionId: z.string().uuid(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  accuracyMeters: z.number().min(0).max(5000).nullable(),
  capturedAt: z.string().datetime(),
  sampleKey: z.string().trim().min(8).max(160),
  permission: z.enum(["granted", "denied", "unavailable"]),
});

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radius = 6_371_000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const deltaLat = (b.latitude - a.latitude) * Math.PI / 180;
  const deltaLng = (b.longitude - a.longitude) * Math.PI / 180;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

export class RouteTrackingService {
  static async startForDelivery(deliveryId: string) {
    const context = await authorize(PERMISSIONS.DELIVERY_UPDATE);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("driver_route_start_internal", { p_delivery_id: uuid.parse(deliveryId), p_actor_user_id: context.userId });
    if (error) throw error;
    return data as { session_id: string; status: "active"; tracking_enabled: true };
  }

  static async heartbeat(raw: z.input<typeof heartbeatSchema>) {
    const input = heartbeatSchema.parse(raw);
    const context = await authorize(PERMISSIONS.DELIVERY_TRACKING_UPDATE);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("driver_route_heartbeat_internal", {
      p_route_session_id: input.routeSessionId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy_meters: input.accuracyMeters,
      p_captured_at: input.capturedAt,
      p_sample_key: input.sampleKey,
      p_permission: input.permission,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async loadForDriver() {
    const context = await authorize(PERMISSIONS.DELIVERY_VIEW);
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária.");
    const admin = createAdminClient();
    const { data: driver, error: driverError } = await admin.from("drivers").select("id").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("user_id", context.userId).eq("active", true).is("deleted_at", null).maybeSingle();
    if (driverError) throw driverError;
    if (!driver) return { enabled: false, sessionId: null };
    const [settings, session] = await Promise.all([
      admin.from("store_operational_settings").select("deliveries_driver_tracking_enabled").eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle(),
      admin.from("driver_route_sessions").select("id,status,location_permission,last_heartbeat_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("driver_id", driver.id).eq("status", "active").maybeSingle(),
    ]);
    if (settings.error) throw settings.error;
    if (session.error) throw session.error;
    return { enabled: Boolean(settings.data?.deliveries_driver_tracking_enabled), sessionId: session.data?.id ?? null, permission: session.data?.location_permission ?? "pending", lastHeartbeatAt: session.data?.last_heartbeat_at ?? null };
  }

  static async loadOwnerPanel() {
    let context;
    try { context = await authorize(PERMISSIONS.DELIVERY_TRACKING_VIEW); }
    catch (error) {
      if (error instanceof AuthorizationError) return { enabled: false, stationaryMinutes: 15, routes: [] };
      throw error;
    }
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária.");
    const admin = createAdminClient();
    const [settingsResult, sessionsResult] = await Promise.all([
      admin.from("store_operational_settings").select("deliveries_driver_tracking_enabled,deliveries_stationary_alert_minutes").eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle(),
      admin.from("driver_route_sessions").select("id,driver_id,status,location_permission,started_at,last_heartbeat_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("status", "active").order("started_at"),
    ]);
    if (settingsResult.error) throw settingsResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    const sessions = sessionsResult.data ?? [];
    const sessionIds = sessions.map((session) => session.id);
    const driverIds = sessions.map((session) => session.driver_id);
    const [drivers, links, points] = await Promise.all([
      driverIds.length ? admin.from("drivers").select("id,name").in("id", driverIds) : Promise.resolve({ data: [], error: null }),
      sessionIds.length ? admin.from("driver_route_deliveries").select("route_session_id,delivery_id").in("route_session_id", sessionIds) : Promise.resolve({ data: [], error: null }),
      sessionIds.length ? admin.from("driver_route_points").select("route_session_id,latitude,longitude,accuracy_meters,captured_at").in("route_session_id", sessionIds).order("captured_at", { ascending: false }).limit(Math.max(100, sessionIds.length * 20)) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [drivers, links, points]) if (result.error) throw result.error;
    const driverNames = new Map((drivers.data ?? []).map((driver) => [driver.id, driver.name]));
    const deliveriesBySession = new Map<string, number>();
    for (const link of links.data ?? []) deliveriesBySession.set(link.route_session_id, (deliveriesBySession.get(link.route_session_id) ?? 0) + 1);
    const pointsBySession = new Map<string, Array<{ latitude: number; longitude: number; accuracy_meters: number | null; captured_at: string }>>();
    for (const point of points.data ?? []) {
      const current = pointsBySession.get(point.route_session_id) ?? [];
      current.push({ latitude: Number(point.latitude), longitude: Number(point.longitude), accuracy_meters: point.accuracy_meters ? Number(point.accuracy_meters) : null, captured_at: point.captured_at });
      pointsBySession.set(point.route_session_id, current);
    }
    const stationaryMinutes = Number(settingsResult.data?.deliveries_stationary_alert_minutes ?? 15);
    const now = Date.now();
    return {
      enabled: Boolean(settingsResult.data?.deliveries_driver_tracking_enabled),
      stationaryMinutes,
      routes: sessions.map((session) => {
        const routePoints = pointsBySession.get(session.id) ?? [];
        const latest = routePoints[0] ?? null;
        const oldestRecent = routePoints.filter((point) => now - Date.parse(point.captured_at) <= stationaryMinutes * 60_000).at(-1) ?? null;
        const heartbeatAgeMinutes = session.last_heartbeat_at ? Math.floor((now - Date.parse(session.last_heartbeat_at)) / 60_000) : null;
        const movedMeters = latest && oldestRecent ? distanceMeters(latest, oldestRecent) : null;
        const noSignal = heartbeatAgeMinutes === null || heartbeatAgeMinutes >= Math.max(3, Math.ceil(stationaryMinutes / 2));
        const possiblyStationary = !noSignal && movedMeters !== null && movedMeters < Math.max(35, (latest?.accuracy_meters ?? 0) * 1.5) && routePoints.length >= 2;
        return { id: session.id, driverName: driverNames.get(session.driver_id) ?? "Entregador", deliveryCount: deliveriesBySession.get(session.id) ?? 0, permission: session.location_permission, startedAt: session.started_at, lastHeartbeatAt: session.last_heartbeat_at, heartbeatAgeMinutes, latest, noSignal, possiblyStationary };
      }),
    };
  }
}
