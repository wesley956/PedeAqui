import type { RouteTrackingService } from "@/server/delivery/route-tracking-service";
import styles from "@/features/delivery/delivery.module.css";

type TrackingData = Awaited<ReturnType<typeof RouteTrackingService.loadOwnerPanel>>;

function time(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(value)) : "sem atualização";
}

export function RouteTrackingPanel({ data }: { data: TrackingData }) {
  if (!data.enabled) return null;
  return <section className={styles.queue} aria-labelledby="route-tracking-title">
    <div className={styles.queueHeader}><div><h2 id="route-tracking-title">Rotas ativas</h2><p className="muted">Última posição compartilhada pelo entregador durante a rota.</p></div><span className={styles.queueCount}>{data.routes.length}</span></div>
    {data.routes.length === 0 ? <div className={styles.empty}>Nenhuma rota compartilhando localização agora.</div> : <div className={styles.cards}>{data.routes.map((route) => {
      const status = route.noSignal ? "Sem atualização de localização" : route.possiblyStationary ? `Possivelmente parado há ${data.stationaryMinutes} min` : "Em deslocamento / localização recente";
      const mapHref = route.latest ? `https://www.google.com/maps/search/?api=1&query=${route.latest.latitude},${route.latest.longitude}` : null;
      return <article className={styles.card} key={route.id} data-late={route.noSignal || route.possiblyStationary || undefined}>
        <div className={styles.cardHeader}><div><strong>{route.driverName}</strong><div className={styles.status}>{status}</div></div><strong>{route.deliveryCount} entrega(s)</strong></div>
        <div className={styles.infoGrid}><Info label="Último sinal" value={time(route.lastHeartbeatAt)} /><Info label="Permissão" value={route.permission === "granted" ? "GPS autorizado" : "GPS indisponível/pendente"} />{route.latest ? <Info label="Precisão informada" value={route.latest.accuracy_meters ? `± ${Math.round(route.latest.accuracy_meters)} m` : "não informada"} /> : null}</div>
        {mapHref ? <a className={styles.secondaryLink} href={mapHref} target="_blank" rel="noreferrer">Abrir última posição no mapa</a> : <p className="muted">A rota continua operacional sem mapa; nenhuma posição válida foi recebida.</p>}
      </article>;
    })}</div>}
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className={styles.info}><span className={styles.infoLabel}>{label}</span><div className={styles.infoValue}>{value}</div></div>;
}
