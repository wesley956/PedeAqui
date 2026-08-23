"use server";

import { RouteTrackingService } from "@/server/delivery/route-tracking-service";

export async function sendRouteHeartbeat(input: {
  routeSessionId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  capturedAt: string;
  sampleKey: string;
  permission: "granted" | "denied" | "unavailable";
}) {
  return RouteTrackingService.heartbeat(input);
}
