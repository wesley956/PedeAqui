"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";

const REFRESH_COALESCE_MS = 160;

export function OrderRealtime({ storeId }: { storeId: string }) {
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);

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

    const channel = supabase
      .channel(`orders:${scope.storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: scope.filter },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [router, storeId]);

  return null;
}
