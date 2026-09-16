"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatStoreDateTime } from "@/lib/store-date-time";
import styles from "./conversations.module.css";

type TimelineMessage = {
  id: string;
  direction: string;
  sender_type: string | null;
  sender_user_id: string | null;
  content_type: string;
  body: string | null;
  delivery_status: string | null;
  external_message_id: string | null;
  error_message: string | null;
  provider_timestamp: string | null;
  metadata: unknown;
  created_at: string;
  authorLabel: string;
};

type MessagePageResponse = {
  messages: TimelineMessage[];
  previousCursor: string | null;
  latestCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
};

function authorKey(label: string) {
  if (label === "Cliente") return "customer";
  if (label === "Robô") return "bot";
  if (label === "Atendente PedeAqui") return "agent";
  if (label === "WhatsApp Business") return "business";
  return "system";
}

function deliveryLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    pending: "enviando",
    sent: "enviada",
    delivered: "entregue",
    read: "lida",
    failed: "falhou",
    received: "recebida",
  };
  return labels[status ?? ""] ?? "enviada";
}

function compareMessages(left: TimelineMessage, right: TimelineMessage) {
  const time = Date.parse(left.created_at) - Date.parse(right.created_at);
  return time !== 0 ? time : left.id.localeCompare(right.id);
}

function mergeMessages(current: TimelineMessage[], incoming: TimelineMessage[]) {
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    merged.set(message.id, { ...merged.get(message.id), ...message });
  }
  return [...merged.values()].sort(compareMessages);
}

async function fetchMessagePage(conversationId: string, query?: { before?: string; after?: string }) {
  const params = new URLSearchParams();
  if (query?.before) params.set("before", query.before);
  if (query?.after) params.set("after", query.after);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Não foi possível sincronizar o histórico.");
  return await response.json() as MessagePageResponse;
}

export function ConversationTimeline({
  conversationId,
  storeId,
  timeZone,
  initialMessages,
  initialPreviousCursor,
  initialLatestCursor,
  initialHasOlder,
}: {
  conversationId: string;
  storeId: string;
  timeZone: string;
  initialMessages: TimelineMessage[];
  initialPreviousCursor: string | null;
  initialLatestCursor: string | null;
  initialHasOlder: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [previousCursor, setPreviousCursor] = useState(initialPreviousCursor);
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [syncState, setSyncState] = useState<"live" | "reconnecting" | "error">("live");
  const latestCursorRef = useRef(initialLatestCursor);
  const conversationRef = useRef(conversationId);
  const loadedOlderRef = useRef(false);
  const syncingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (conversationRef.current !== conversationId) {
      conversationRef.current = conversationId;
      loadedOlderRef.current = false;
      setMessages(initialMessages);
      setPreviousCursor(initialPreviousCursor);
      setHasOlder(initialHasOlder);
      latestCursorRef.current = initialLatestCursor;
      return;
    }

    setMessages((current) => mergeMessages(current, initialMessages));
    if (!loadedOlderRef.current) {
      setPreviousCursor(initialPreviousCursor);
      setHasOlder(initialHasOlder);
    }
    if (initialLatestCursor) latestCursorRef.current = initialLatestCursor;
  }, [conversationId, initialHasOlder, initialLatestCursor, initialMessages, initialPreviousCursor]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [conversationId]);

  const catchUp = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const element = scrollRef.current;
    const shouldStickToBottom = element
      ? element.scrollHeight - element.scrollTop - element.clientHeight < 140
      : true;

    try {
      let cursor = latestCursorRef.current;
      let loops = 0;
      do {
        const page = await fetchMessagePage(conversationId, cursor ? { after: cursor } : undefined);
        setMessages((current) => mergeMessages(current, page.messages));
        if (page.latestCursor) {
          cursor = page.latestCursor;
          latestCursorRef.current = page.latestCursor;
        }
        if (!page.hasNewer || !page.latestCursor) break;
        loops += 1;
      } while (loops < 10);
      setSyncState("live");

      if (shouldStickToBottom) {
        window.requestAnimationFrame(() => {
          const target = scrollRef.current;
          if (target) target.scrollTop = target.scrollHeight;
        });
      }
    } catch {
      setSyncState("error");
    } finally {
      syncingRef.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`conversation-thread:${storeId}:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        () => { void catchUp(); },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (typeof row.id !== "string") return;
          setMessages((current) => current.map((message) => message.id === row.id ? {
            ...message,
            delivery_status: typeof row.delivery_status === "string" ? row.delivery_status : message.delivery_status,
            error_message: typeof row.error_message === "string" || row.error_message === null ? row.error_message as string | null : message.error_message,
            external_message_id: typeof row.external_message_id === "string" || row.external_message_id === null ? row.external_message_id as string | null : message.external_message_id,
          } : message));
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncState("live");
          void catchUp();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncState("reconnecting");
        } else if (status === "CLOSED") {
          setSyncState("error");
        }
      });

    const resume = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    const online = () => { void catchUp(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", online);

    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", online);
      void supabase.removeChannel(channel);
    };
  }, [catchUp, conversationId, storeId]);

  const loadOlder = async () => {
    if (!previousCursor || loadingOlder) return;
    setLoadingOlder(true);
    const element = scrollRef.current;
    const previousHeight = element?.scrollHeight ?? 0;
    try {
      const page = await fetchMessagePage(conversationId, { before: previousCursor });
      loadedOlderRef.current = true;
      setMessages((current) => mergeMessages(current, page.messages));
      setPreviousCursor(page.previousCursor);
      setHasOlder(page.hasOlder);
      window.requestAnimationFrame(() => {
        const target = scrollRef.current;
        if (target) target.scrollTop += target.scrollHeight - previousHeight;
      });
    } catch {
      setSyncState("error");
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div ref={scrollRef} className={styles.messages} aria-label="Histórico da conversa">
      <div className={styles.filters}>
        {hasOlder && previousCursor ? (
          <button className={styles.filter} type="button" onClick={() => { void loadOlder(); }} disabled={loadingOlder}>
            {loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}
          </button>
        ) : messages.length > 0 ? <span className={styles.contextMuted}>Início do histórico carregado</span> : null}
        {syncState !== "live" ? (
          <span role="status" className={styles.contextMuted}>
            {syncState === "reconnecting" ? "Reconectando atualizações…" : "Atualização em tempo real indisponível; tentando sincronizar."}
          </span>
        ) : null}
      </div>

      {messages.length === 0 ? <span className="muted">Sem mensagens ainda.</span> : messages.map((message) => {
        const outbound = message.direction === "outbound";
        return <div key={message.id} className={styles.message} data-direction={outbound ? "outbound" : "inbound"}>
          <span className={styles.authorTag} data-author={authorKey(message.authorLabel)}>{message.authorLabel}</span>
          <div className={styles.bubble}>{message.body || `[${message.content_type}]`}</div>
          <span className={styles.messageMeta}>{formatStoreDateTime(message.created_at, timeZone)} · {outbound ? deliveryLabel(message.delivery_status) : "recebida"}{message.error_message ? ` · ${message.error_message}` : ""}</span>
        </div>;
      })}
    </div>
  );
}
