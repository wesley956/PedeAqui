"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createOrderAlertAudio,
  playOrderAlertTone,
  readOrderAlertPreference,
  writeOrderAlertPreference,
} from "@/features/orders/order-alert-tone";

export type OrderAlertStatus = "off" | "needs_activation" | "ready";
type MessageHandler = (message: string) => void;

type OrderAlertContextValue = {
  status: OrderAlertStatus;
  soundEnabled: boolean;
  primaryLabel: string;
  toggle: (onMessage?: MessageHandler) => Promise<boolean>;
  test: (onMessage?: MessageHandler) => Promise<boolean>;
  notifyNewOrder: (displayNumber?: number, onMessage?: MessageHandler) => Promise<"disabled" | "needs_activation" | "blocked" | "played">;
};

const OrderAlertContext = createContext<OrderAlertContextValue | null>(null);

function showBackgroundNotification(displayNumber?: number) {
  if (typeof document === "undefined" || !document.hidden) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const suffix = displayNumber ? ` #${displayNumber}` : "";
  const notification = new Notification(`Novo pedido${suffix} · PedeAqui`, {
    body: "Um novo pedido acabou de chegar. Abra o painel para conferir.",
    icon: "/icon.svg",
    tag: displayNumber ? `pedeaqui-order-${displayNumber}` : "pedeaqui-new-order",
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

export function OrderAlertProvider({ children, storeId }: { children: ReactNode; storeId: string | null }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<OrderAlertStatus>("off");
  const statusRef = useRef<OrderAlertStatus>("off");
  const configuredRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const updateStatus = useCallback((next: OrderAlertStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    const audio = createOrderAlertAudio();
    const configured = readOrderAlertPreference();
    audioRef.current = audio;
    configuredRef.current = configured;
    const restoreTimer = window.setTimeout(() => {
      updateStatus(configured ? "needs_activation" : "off");
    }, 0);

    return () => {
      window.clearTimeout(restoreTimer);
      audio.pause();
      audio.currentTime = 0;
      audioRef.current = null;
    };
  }, [updateStatus]);

  const reproduceAndValidate = useCallback(async () => {
    const audio = audioRef.current ?? createOrderAlertAudio();
    audioRef.current = audio;
    try {
      await playOrderAlertTone(audio);
      updateStatus("ready");
      return true;
    } catch {
      updateStatus(configuredRef.current ? "needs_activation" : "off");
      return false;
    }
  }, [updateStatus]);

  const activate = useCallback(async (onMessage?: MessageHandler) => {
    configuredRef.current = true;
    writeOrderAlertPreference(true);

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => undefined);
    }

    const played = await reproduceAndValidate();
    if (played) {
      onMessage?.("Aviso sonoro ativado e testado neste aparelho.");
    } else {
      onMessage?.("O som ficou salvo, mas o navegador ainda bloqueou a reprodução. Verifique se a página está silenciada e toque em Liberar som.");
    }
    return played;
  }, [reproduceAndValidate]);

  const deactivate = useCallback((onMessage?: MessageHandler) => {
    configuredRef.current = false;
    writeOrderAlertPreference(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    updateStatus("off");
    onMessage?.("Aviso sonoro desativado.");
  }, [updateStatus]);

  const toggle = useCallback(async (onMessage?: MessageHandler) => {
    if (statusRef.current === "ready") {
      deactivate(onMessage);
      return false;
    }
    return activate(onMessage);
  }, [activate, deactivate]);

  const test = useCallback(async (onMessage?: MessageHandler) => {
    const wasConfigured = configuredRef.current;
    const played = await reproduceAndValidate();
    if (!played) {
      onMessage?.("Não foi possível reproduzir o teste. Verifique o volume do computador e se o navegador ou esta guia estão silenciados.");
      return false;
    }

    if (wasConfigured) {
      onMessage?.("Teste de som reproduzido com sucesso. O aviso de novos pedidos está ativo.");
    } else {
      updateStatus("off");
      onMessage?.("Teste de som reproduzido com sucesso. Para receber alertas de novos pedidos, ative o som.");
    }
    return true;
  }, [reproduceAndValidate, updateStatus]);

  const notifyNewOrder = useCallback(async (displayNumber?: number, onMessage?: MessageHandler) => {
    showBackgroundNotification(displayNumber);
    if (!configuredRef.current) return "disabled" as const;
    if (statusRef.current !== "ready") {
      onMessage?.("Novo pedido recebido. O som está salvo, mas precisa ser liberado neste navegador.");
      return "needs_activation" as const;
    }

    const played = await reproduceAndValidate();
    if (!played) {
      onMessage?.("Novo pedido recebido, mas o navegador bloqueou o áudio. Toque em Liberar som para reativar.");
      return "blocked" as const;
    }
    return "played" as const;
  }, [reproduceAndValidate]);

  useEffect(() => {
    if (!storeId || pathname === "/pedidos" || pathname.startsWith("/pedidos/")) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`global-order-alert:${storeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        (payload) => {
          const row = payload.new as { order_status?: string; display_number?: number };
          if (row.order_status === "pending_confirmation") {
            void notifyNewOrder(row.display_number);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [notifyNewOrder, pathname, storeId]);

  const value = useMemo<OrderAlertContextValue>(() => ({
    status,
    soundEnabled: status === "ready",
    primaryLabel: status === "ready" ? "Som ativo ✓" : status === "needs_activation" ? "Liberar som" : "Ativar som",
    toggle,
    test,
    notifyNewOrder,
  }), [notifyNewOrder, status, test, toggle]);

  return <OrderAlertContext.Provider value={value}>{children}</OrderAlertContext.Provider>;
}

export function useOrderAlert(onMessage?: MessageHandler) {
  const alert = useContext(OrderAlertContext);
  if (!alert) throw new Error("useOrderAlert deve ser usado dentro de OrderAlertProvider");

  return useMemo(() => ({
    status: alert.status,
    soundEnabled: alert.soundEnabled,
    primaryLabel: alert.primaryLabel,
    toggle: () => alert.toggle(onMessage),
    test: () => alert.test(onMessage),
    notifyNewOrder: (displayNumber?: number) => alert.notifyNewOrder(displayNumber, onMessage),
  }), [alert, onMessage]);
}
