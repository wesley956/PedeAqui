"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createOrderAlertAudio,
  playOrderAlertTone,
  readOrderAlertPreference,
  writeOrderAlertPreference,
} from "@/features/orders/order-alert-tone";

export type OrderAlertStatus = "off" | "needs_activation" | "ready";

export function useOrderAlert(onMessage?: (message: string) => void) {
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
    updateStatus(configured ? "needs_activation" : "off");

    return () => {
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

  const activate = useCallback(async () => {
    configuredRef.current = true;
    writeOrderAlertPreference(true);
    const played = await reproduceAndValidate();
    if (played) {
      onMessage?.("Aviso sonoro ativado e testado neste aparelho.");
    } else {
      onMessage?.("O som ficou salvo, mas o navegador ainda bloqueou a reprodução. Verifique se a página está silenciada e toque em Liberar som.");
    }
    return played;
  }, [onMessage, reproduceAndValidate]);

  const deactivate = useCallback(() => {
    configuredRef.current = false;
    writeOrderAlertPreference(false);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    updateStatus("off");
    onMessage?.("Aviso sonoro desativado.");
  }, [onMessage, updateStatus]);

  const toggle = useCallback(async () => {
    if (statusRef.current === "ready") {
      deactivate();
      return false;
    }
    return activate();
  }, [activate, deactivate]);

  const test = useCallback(async () => {
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
  }, [onMessage, reproduceAndValidate, updateStatus]);

  const notifyNewOrder = useCallback(async () => {
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
  }, [onMessage, reproduceAndValidate]);

  const primaryLabel = status === "ready"
    ? "Som ativo ✓"
    : status === "needs_activation"
      ? "Liberar som"
      : "Ativar som";

  return {
    status,
    soundEnabled: status === "ready",
    primaryLabel,
    toggle,
    test,
    notifyNewOrder,
  };
}
