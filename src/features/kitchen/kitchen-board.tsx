"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  filterKitchenOrdersByStation,
  kitchenElapsedLabel,
  kitchenUrgency,
  type KitchenOrder,
  type KitchenStation,
  type KitchenUrgency,
} from "@/features/kitchen/kitchen-model";

const productionLabels: Record<KitchenOrder["productionStatus"], string> = {
  pending_confirmation: "Aguardando início",
  queued: "Na fila",
  preparing: "Em preparo",
  ready: "Pronto",
};

export function KitchenBoard({
  storeId,
  stations,
  orders,
  initialNow,
}: {
  storeId: string;
  stations: KitchenStation[];
  orders: KitchenOrder[];
  initialNow: number;
}) {
  const router = useRouter();
  const [stationId, setStationId] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`kds:${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, storeId]);

  const visibleOrders = useMemo(
    () => filterKitchenOrdersByStation(orders, stationId),
    [orders, stationId],
  );

  const stationNames = useMemo(
    () => new Map(stations.map((station) => [station.id, station.name])),
    [stations],
  );

  const counts = useMemo(() => {
    let attention = 0;
    let late = 0;
    for (const order of visibleOrders) {
      const urgency = kitchenUrgency(order, now);
      if (urgency === "attention") attention += 1;
      if (urgency === "late") late += 1;
    }
    return { attention, late };
  }, [now, visibleOrders]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <FilterButton active={stationId === null} onClick={() => setStationId(null)}>
          Todas
        </FilterButton>
        {stations.map((station) => (
          <FilterButton key={station.id} active={stationId === station.id} onClick={() => setStationId(station.id)}>
            {station.name}
          </FilterButton>
        ))}
        <button type="button" onClick={() => router.refresh()} style={secondaryButton}>Atualizar</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} aria-live="polite">
        <SummaryBadge label="Na tela" value={visibleOrders.length} />
        <SummaryBadge label="Atenção" value={counts.attention} tone="attention" />
        <SummaryBadge label="Atrasados" value={counts.late} tone="late" />
      </div>

      {stations.length === 0 ? (
        <div className="card" style={{ padding: 24 }}>
          <strong>Nenhuma estação de produção ativa</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            O painel em “Todas” continua exibindo pedidos. Configure estações em Configurações → Impressões para usar o filtro de cozinha/chapa/fritura.
          </p>
        </div>
      ) : null}

      {visibleOrders.length === 0 ? (
        <div className="card" style={{ padding: 34, textAlign: "center" }}>
          <strong>Nenhum pedido em produção</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            Pedidos confirmados aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 12, alignItems: "start" }}>
          {visibleOrders.map((order) => (
            <KitchenCard
              key={order.id}
              order={order}
              now={now}
              stationNames={stationNames}
              filteredByStation={stationId !== null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenCard({
  order,
  now,
  stationNames,
  filteredByStation,
}: {
  order: KitchenOrder;
  now: number;
  stationNames: Map<string, string>;
  filteredByStation: boolean;
}) {
  const urgency = kitchenUrgency(order, now);
  const style = urgencyStyle(urgency);

  return (
    <article className="card" style={{ padding: 0, overflow: "hidden", border: style.border, background: style.background }}>
      <header style={{ padding: "13px 14px", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "start", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>#{order.displayNumber}</div>
          <strong style={{ display: "block", marginTop: 2 }}>{order.customerName}</strong>
          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
            {order.fulfillmentType === "delivery" ? "Entrega" : order.fulfillmentType === "pickup" ? "Retirada" : order.fulfillmentType}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 950, color: style.timerColor }}>
            {kitchenElapsedLabel(order, now)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 850, marginTop: 7 }}>{productionLabels[order.productionStatus]}</div>
          {urgency !== "fresh" ? (
            <div style={{ marginTop: 5, fontSize: 10, fontWeight: 950, textTransform: "uppercase", color: style.timerColor }}>
              {urgency === "late" ? "Atrasado" : "Atenção"}
            </div>
          ) : null}
        </div>
      </header>

      <div style={{ display: "grid", gap: 0 }}>
        {order.items.map((item) => (
          <div key={item.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <strong style={{ fontSize: 21, color: "var(--accent)" }}>{item.quantity}×</strong>
              <strong style={{ fontSize: 17 }}>{item.name}</strong>
            </div>
            {item.modifiers.length > 0 ? (
              <div style={{ display: "grid", gap: 3 }}>
                {item.modifiers.map((modifier, index) => (
                  <div key={`${item.id}:${modifier.groupName}:${modifier.name}:${index}`} className="muted" style={{ fontSize: 12 }}>
                    + {modifier.name}
                  </div>
                ))}
              </div>
            ) : null}
            {item.note ? (
              <div style={{ padding: "7px 8px", borderRadius: 8, background: "var(--surface-3)", fontSize: 12, fontWeight: 800 }}>
                Obs.: {item.note}
              </div>
            ) : null}
            {!filteredByStation ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {item.stationIds.length > 0
                  ? item.stationIds.map((id) => <StationTag key={id}>{stationNames.get(id) ?? "Estação"}</StationTag>)
                  : <StationTag warning>Sem estação</StationTag>}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <footer style={{ padding: 10 }}>
        <Link href={`/pedidos/${order.id}`} style={{ display: "block", textAlign: "center", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 10px", fontSize: 12, fontWeight: 850 }}>
          Abrir pedido
        </Link>
      </footer>
    </article>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ ...secondaryButton, borderColor: active ? "var(--accent)" : "var(--border)", color: active ? "var(--accent)" : "var(--text)" }}
    >
      {children}
    </button>
  );
}

function SummaryBadge({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "attention" | "late" }) {
  const border = tone === "late" ? "var(--state-danger)" : tone === "attention" ? "var(--state-warning)" : "var(--border)";
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 850 }}>
      {label}: {value}
    </div>
  );
}

function StationTag({ children, warning = false }: { children: React.ReactNode; warning?: boolean }) {
  return (
    <span style={{ borderRadius: 999, padding: "3px 7px", background: warning ? "var(--state-warning-surface)" : "var(--surface-3)", fontSize: 10, fontWeight: 800 }}>
      {children}
    </span>
  );
}

function urgencyStyle(urgency: KitchenUrgency) {
  if (urgency === "late") return { border: "2px solid var(--state-danger)", background: "var(--state-danger-surface)", timerColor: "var(--state-danger-text)" };
  if (urgency === "attention") return { border: "2px solid var(--state-warning)", background: "var(--state-warning-surface)", timerColor: "var(--state-warning-text)" };
  return { border: "1px solid var(--border)", background: "var(--surface)", timerColor: "var(--text)" };
}

const secondaryButton: React.CSSProperties = {
  minHeight: 38,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "7px 11px",
  fontWeight: 850,
  cursor: "pointer",
};
