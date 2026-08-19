"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";

export function DeliveryRealtime({ storeId, showStatus = false }: { storeId: string; showStatus?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const hasValidStoreScope = realtimeStoreScope(storeId) !== null;

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;

    const supabase = createClient();
    const refresh = () => router.refresh();
    const channel = supabase.channel(`delivery-ops:${scope.storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: scope.filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: scope.filter }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers", filter: scope.filter }, refresh)
      .subscribe((next) => {
        if (next === "SUBSCRIBED") setStatus("connected");
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) setStatus("error");
        else setStatus("connecting");
      });
    return () => { void supabase.removeChannel(channel); };
  }, [router, storeId]);

  if (!showStatus) return null;
  const displayStatus = hasValidStoreScope ? status : "error";
  return <span className="delivery-realtime-status" data-status={displayStatus} role="status" aria-live="polite">
    {displayStatus === "connected" ? "Atualização ao vivo" : displayStatus === "error" ? "Sem atualização ao vivo · use Atualizar se necessário" : "Conectando atualizações…"}
  </span>;
}
