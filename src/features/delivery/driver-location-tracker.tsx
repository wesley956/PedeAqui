"use client";

import { useEffect, useRef, useState } from "react";
import { sendRouteHeartbeat } from "@/features/delivery/route-tracking-actions";

type TrackingState = "idle" | "requesting" | "active" | "denied" | "offline" | "error";

export function DriverLocationTracker({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<TrackingState>("idle");
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  async function reportUnavailable(permission: "denied" | "unavailable") {
    try {
      await sendRouteHeartbeat({ routeSessionId: sessionId, latitude: null, longitude: null, accuracyMeters: null, capturedAt: new Date().toISOString(), sampleKey: `${permission}:${crypto.randomUUID()}`, permission });
    } catch { /* GPS jamais bloqueia a entrega. */ }
  }

  function start() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (!navigator.geolocation) {
      setState("error");
      void reportUnavailable("unavailable");
      return;
    }
    setState("requesting");
    watchId.current = navigator.geolocation.watchPosition(async (position) => {
      const now = Date.now();
      if (now - lastSentAt.current < 12_000) return;
      lastSentAt.current = now;
      try {
        await sendRouteHeartbeat({
          routeSessionId: sessionId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          sampleKey: `gps:${position.timestamp}:${Math.round(position.coords.latitude * 100000)}:${Math.round(position.coords.longitude * 100000)}`,
          permission: "granted",
        });
        setState(navigator.onLine ? "active" : "offline");
      } catch {
        setState(navigator.onLine ? "error" : "offline");
      }
    }, (error) => {
      const denied = error.code === error.PERMISSION_DENIED;
      setState(denied ? "denied" : "error");
      void reportUnavailable(denied ? "denied" : "unavailable");
    }, { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 });
  }

  const labels: Record<TrackingState, string> = {
    idle: "Compartilhar localização da rota",
    requesting: "Aguardando permissão do celular…",
    active: "Rota ativa — localização compartilhada",
    denied: "Localização negada — a entrega continua disponível",
    offline: "Sem conexão — retomaremos quando possível",
    error: "GPS indisponível — a entrega continua disponível",
  };
  const canRetry = state === "denied" || state === "offline" || state === "error";
  return <div role="status" aria-live="polite" data-tracking-state={state}>
    {state === "idle" ? <button type="button" onClick={start}>Compartilhar localização da rota</button> : <strong>{labels[state]}</strong>}
    {state === "denied" ? <small>Libere a localização nas permissões do navegador e tente novamente. Você ainda pode concluir a entrega sem rastreamento.</small> : null}
    {state === "offline" ? <small>Confira a internet do celular. A entrega continua disponível e você pode tentar novamente quando a conexão voltar.</small> : null}
    {state === "error" ? <small>Confira se a localização do celular está ligada. A entrega continua disponível mesmo sem GPS.</small> : null}
    {canRetry ? <button type="button" onClick={start}>Tentar compartilhar novamente</button> : null}
    <small>O compartilhamento ocorre somente durante esta rota e para ao concluir a entrega. Navegadores móveis podem suspender atualizações em segundo plano.</small>
  </div>;
}
