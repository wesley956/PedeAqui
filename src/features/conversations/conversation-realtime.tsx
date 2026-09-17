"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";

export function ConversationRealtime({ storeId }: { storeId: string }) {
  const router = useRouter();

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;

    const supabase = createClient();
    let refreshTimer: number | null = null;
    let reconnecting = false;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, 180);
    };

    const channel = supabase
      .channel(`conversations:${scope.storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: scope.filter },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reconnecting = true;
        } else if (status === "SUBSCRIBED" && reconnecting) {
          reconnecting = false;
          scheduleRefresh();
        }
      });

    const resume = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const online = () => scheduleRefresh();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", online);

    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", online);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router, storeId]);

  return null;
}
