"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";
import type { HumanAttentionAlertData } from "@/server/conversations/human-attention-alert-service";
import styles from "./human-attention-alert.module.css";

export function HumanAttentionAlert({ storeId, alert }: { storeId: string; alert: HumanAttentionAlertData }) {
  const router = useRouter();

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;
    const supabase = createClient();
    let timer: number | null = null;
    const refresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        router.refresh();
      }, 180);
    };

    const channel = supabase
      .channel(`human-attention:${scope.storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: scope.filter }, refresh)
      .subscribe();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [router, storeId]);

  if (alert.count <= 0) return null;

  const params = new URLSearchParams({ status: "waiting_agent" });
  if (alert.firstConversationId) params.set("conversation", alert.firstConversationId);
  const label = alert.count === 1
    ? "1 cliente está aguardando atendimento humano"
    : `${alert.count} clientes estão aguardando atendimento humano`;

  return (
    <div className={styles.banner} role="alert" aria-live="assertive">
      <span className={styles.pulse} aria-hidden />
      <div className={styles.copy}>
        <strong>{label}</strong>
        <span>O automático está pausado nessas conversas até alguém assumir.</span>
      </div>
      <Link className={styles.action} href={`/conversas?${params.toString()}`}>Atender agora</Link>
    </div>
  );
}
