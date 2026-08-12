"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeliveryRealtime({ storeId }: { storeId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();
    const channel = supabase.channel(`delivery-ops:${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `store_id=eq.${storeId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter: `store_id=eq.${storeId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, storeId]);
  return null;
}
