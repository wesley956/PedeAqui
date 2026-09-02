"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";
import { trackProductExperience } from "@/lib/product-experience/client";

export type OperationalRealtimeStatus = "connecting" | "connected" | "degraded";
type RealtimeRow = { id: string; created_at?: string; updated_at?: string };
type RowEvent<T> = { eventType: "INSERT" | "UPDATE" | "DELETE"; row: T; committedAt: string };

const reconcileEveryMs = 60_000;
const degradedReconcileMs = 15_000;

export function applyOperationalRowEvent<T extends RealtimeRow>(
  current: readonly T[],
  eventType: RowEvent<T>["eventType"],
  row: T,
  isOperational: (value: T) => boolean,
) {
  const without = current.filter((value) => value.id !== row.id);
  if (eventType === "DELETE" || !isOperational(row)) return without;
  const next = [...without, row];
  next.sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
  return next;
}

export function useOperationalRealtime<T extends RealtimeRow>({
  storeId,
  initialRows,
  surface,
  isOperational,
  onInsert,
  resolveRow,
}: {
  storeId: string;
  initialRows: T[];
  surface: "orders" | "kitchen" | "movement";
  isOperational: (row: T) => boolean;
  onInsert?: (row: T) => void;
  resolveRow?: (raw: Record<string, unknown>) => Promise<T | null>;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [status, setStatus] = useState<OperationalRealtimeStatus>("connecting");
  const statusRef = useRef<OperationalRealtimeStatus>("connecting");
  const statusChangedAt = useRef<number | null>(null);
  const versions = useRef(new Map<string, number>());
  const appliedEvents = useRef(0);
  const insertCallback = useRef(onInsert);
  const resolver = useRef(resolveRow);

  useEffect(() => {
    insertCallback.current = onInsert;
    resolver.current = resolveRow;
  }, [onInsert, resolveRow]);

  useEffect(() => {
    startTransition(() => setRows(initialRows));
  }, [initialRows]);

  useEffect(() => {
    const scope = realtimeStoreScope(storeId);
    if (!scope) return;
    statusChangedAt.current = Date.now();
    const supabase = createClient();
    const updateStatus = (next: OperationalRealtimeStatus) => {
      const previous = statusRef.current;
      if (previous === next) return;
      const durationMs = statusChangedAt.current === null ? null : Date.now() - statusChangedAt.current;
      statusChangedAt.current = Date.now();
      statusRef.current = next;
      setStatus(next);
      trackProductExperience({
        eventName: "px.realtime.connection",
        outcome: next === "connected" ? (previous === "degraded" ? "recovered" : "success") : next === "degraded" ? "failure" : "unknown",
        durationMs,
        metadata: { surface, state: next, previous_state: previous, transport: "supabase_realtime" },
      });
    };
    const apply = (event: RowEvent<T>) => {
      const version = Date.parse(event.row.updated_at ?? event.committedAt);
      const previousVersion = versions.current.get(event.row.id) ?? 0;
      if (Number.isFinite(version) && version <= previousVersion) return;
      versions.current.set(event.row.id, Number.isFinite(version) ? version : Date.now());
      startTransition(() => setRows((current) => applyOperationalRowEvent(current, event.eventType, event.row, isOperational)));
      appliedEvents.current += 1;
      if (appliedEvents.current % 20 === 0) {
        const committedAt = Date.parse(event.committedAt);
        trackProductExperience({
          eventName: "px.realtime.connection",
          outcome: "success",
          durationMs: Number.isFinite(committedAt) ? Math.max(0, Date.now() - committedAt) : null,
          metadata: { surface, state: "event_applied", previous_state: statusRef.current, transport: "supabase_realtime" },
        });
      }
      if (event.eventType === "INSERT") insertCallback.current?.(event.row);
    };
    const channel = supabase.channel(`operational:${surface}:${scope.storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: scope.filter }, async (payload) => {
        const raw = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown>;
        if (typeof raw.id !== "string") return;
        const row = resolver.current ? await resolver.current(raw) : raw as T;
        if (!row) {
          startTransition(() => setRows((current) => current.filter((item) => item.id !== raw.id)));
          return;
        }
        apply({ eventType: payload.eventType, row, committedAt: payload.commit_timestamp });
      })
      .subscribe((next) => {
        if (next === "SUBSCRIBED") updateStatus("connected");
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) updateStatus("degraded");
        else updateStatus("connecting");
      });
    const reconcile = () => router.refresh();
    const regularTimer = window.setInterval(reconcile, reconcileEveryMs);
    const degradedTimer = window.setInterval(() => {
      if (statusRef.current !== "connected" && navigator.onLine) reconcile();
    }, degradedReconcileMs);
    const online = () => { updateStatus("connecting"); reconcile(); };
    const visible = () => { if (document.visibilityState === "visible") reconcile(); };
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(regularTimer);
      window.clearInterval(degradedTimer);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
      void supabase.removeChannel(channel);
    };
  }, [isOperational, router, storeId, surface]);

  return { rows, status };
}

export function OperationalRealtimeBadge({ status }: { status: OperationalRealtimeStatus }) {
  return <span className="operational-realtime-status" data-status={status} role="status" aria-live="polite">
    {status === "connected" ? "Ao vivo" : status === "connecting" ? "Reconectando…" : "Modo degradado · conferindo automaticamente"}
  </span>;
}
