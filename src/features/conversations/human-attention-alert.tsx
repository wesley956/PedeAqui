"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";
import type { HumanAttentionAlertData } from "@/server/conversations/human-attention-alert-service";
import styles from "./human-attention-alert.module.css";

export function HumanAttentionAlert({ storeId, alert }: { storeId: string; alert: HumanAttentionAlertData }) {
  const [live, setLive] = useState<{ storeId: string; alert: HumanAttentionAlertData } | null>(null);
  const current = live?.storeId === storeId ? live.alert : alert;

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;
    const supabase = createClient();
    let timer: number | null = null;
    let reconnecting = false;
    let active = true;
    let inFlight = false;
    let dirty = false;
    let controller: AbortController | null = null;
    const read = async () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (inFlight) { dirty = true; return; }
      inFlight = true;
      dirty = false;
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 10_000);
      try {
        const response = await fetch(`/api/conversations/human-attention?storeId=${encodeURIComponent(storeId)}`, { cache: "no-store", signal: request.signal });
        if (!response.ok) return;
        const result = await response.json();
        if (active && result.storeId === storeId && Number.isInteger(result.alert?.count) && result.alert.count >= 0
          && (result.alert.firstConversationId === null || typeof result.alert.firstConversationId === "string")) {
          setLive({ storeId, alert: result.alert });
        }
      } catch {
        // Keep the last known queue on timeout/offline; the next event or safety poll reconciles it.
      } finally {
        window.clearTimeout(timeout);
        controller = null;
        inFlight = false;
        if (active && dirty) refresh();
      }
    };
    const refresh = () => {
      if (!active || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        void read();
      }, 250);
    };

    const safetyPoll = window.setInterval(refresh, 60_000);
    refresh();

    const channel = supabase
      .channel(`human-attention:${scope.storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: scope.filter }, refresh)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reconnecting = true;
        } else if (status === "SUBSCRIBED" && reconnecting) {
          reconnecting = false;
          refresh();
        }
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onOnline = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(safetyPoll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (timer !== null) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [storeId]);

  if (current.count <= 0) return null;

  const params = new URLSearchParams({ status: "waiting_agent" });
  if (current.firstConversationId) params.set("conversation", current.firstConversationId);
  const label = current.count === 1
    ? "1 cliente está aguardando atendimento humano"
    : `${current.count} clientes estão aguardando atendimento humano`;

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
