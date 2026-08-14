"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeliveryRealtime({ storeId, showStatus = false }: { storeId: string; showStatus?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => router.refresh();
    const channel = supabase.channel(`delivery-ops:${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `store_id=eq.${storeId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter: `store_id=eq.${storeId}` }, refresh)
      .subscribe((next) => {
        if (next === "SUBSCRIBED") setStatus("connected");
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) setStatus("error");
        else setStatus("connecting");
      });
    return () => { void supabase.removeChannel(channel); };
  }, [router, storeId]);

  if (!showStatus) return null;
  return <span className="delivery-realtime-status" data-status={status} role="status" aria-live="polite">
    {status === "connected" ? "Atualização ao vivo" : status === "error" ? "Sem atualização ao vivo · use Atualizar se necessário" : "Conectando atualizações…"}
  </span>;
}
