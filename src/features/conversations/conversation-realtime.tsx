"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ConversationRealtime({ storeId }: { storeId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        router.refresh();
      }, 180);
    };

    const channel = supabase
      .channel(`conversations:${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `store_id=eq.${storeId}` },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `store_id=eq.${storeId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [router, storeId]);

  return null;
}
