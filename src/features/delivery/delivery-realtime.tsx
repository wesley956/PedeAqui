"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";

const REFRESH_COALESCE_MS = 200;
const DEGRADED_REFRESH_MS = 30_000;
const DELIVERY_REALTIME_TABLES = ["orders", "deliveries", "drivers"] as const;

type DeliveryRealtimeTable = (typeof DELIVERY_REALTIME_TABLES)[number];
type RealtimeStatus = "connecting" | "connected" | "error";

export function DeliveryRealtime({
  storeId,
  showStatus = false,
  tables = DELIVERY_REALTIME_TABLES,
}: {
  storeId: string;
  showStatus?: boolean;
  tables?: readonly DeliveryRealtimeTable[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const statusRef = useRef<RealtimeStatus>("connecting");
  const refreshTimerRef = useRef<number | null>(null);
  const hasValidStoreScope = realtimeStoreScope(storeId) !== null;
  const tableKey = tables.join(",");

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;

    const supabase = createClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current !== null) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        router.refresh();
      }, REFRESH_COALESCE_MS);
    };
    const updateStatus = (next: RealtimeStatus) => {
      statusRef.current = next;
      setStatus(next);
    };

    let channel = supabase.channel(`delivery-ops:${scope.storeId}:${tableKey}`);
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: scope.filter },
        scheduleRefresh,
      );
    }
    channel.subscribe((next) => {
      if (next === "SUBSCRIBED") updateStatus("connected");
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) updateStatus("error");
      else updateStatus("connecting");
    });

    const refreshAfterReconnect = () => {
      updateStatus("connecting");
      scheduleRefresh();
    };
    const refreshAfterVisibility = () => {
      if (document.visibilityState === "visible" && statusRef.current !== "connected") scheduleRefresh();
    };
    const degradedRefresh = window.setInterval(() => {
      if (statusRef.current !== "connected" && navigator.onLine) scheduleRefresh();
    }, DEGRADED_REFRESH_MS);

    window.addEventListener("online", refreshAfterReconnect);
    document.addEventListener("visibilitychange", refreshAfterVisibility);

    return () => {
      window.removeEventListener("online", refreshAfterReconnect);
      document.removeEventListener("visibilitychange", refreshAfterVisibility);
      window.clearInterval(degradedRefresh);
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [router, storeId, tableKey, tables]);

  if (!showStatus) return null;
  const displayStatus = hasValidStoreScope ? status : "error";
  return <span className="delivery-realtime-status" data-status={displayStatus} role="status" aria-live="polite">
    {displayStatus === "connected"
      ? "Atualização ao vivo"
      : displayStatus === "error"
        ? "Reconectando atualizações · os dados serão conferidos automaticamente"
        : "Conectando atualizações…"}
  </span>;
}
