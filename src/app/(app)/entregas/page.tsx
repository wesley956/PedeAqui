import Link from "next/link";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DeliverySla } from "@/features/delivery/delivery-sla";
import { DeliveryOperationForm, DriverCreateForm, DriverUpdateForm } from "@/features/delivery/operation-forms";

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}
function address(order: Awaited<ReturnType<typeof DeliveryOperationsService.loadOperations>>["deliveries"][number]) {
  const line = [order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ");
  return [line, order.address_complement_snapshot, order.address_district_snapshot, [order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}
const statusLabel: Record<string, string> = {
  pending: "Pronto para expedição",
  awaiting_assignment: "Aguardando entregador",
  assigned: "Entregador atribuído",
  picked_up: "Retirado no restaurante",
  out_for_delivery: "Em rota",
  delivered: "Entregue",
};

export default async function DeliveryOperationsPage() {
  const data = await DeliveryOperationsService.loadOperations();
  if (!data.context.storeId) throw new Error("Uma unidade ativa é necessária");
  const driversForForm = data.drivers.map((driver) => ({
    id: driver.id,
    name: driver.name,
    active: driver.active,
    on_duty: driver.on_duty,
    max_active_deliveries: Number(driver.max_active_deliveries),
    activeDeliveries: driver.activeDeliveries,
  }));
  const driverNames = new Map(data.drivers.map((driver) => [driver.id, driver.name]));
  const open = data.deliveries.filter((item) => item.fulfillment_status !== "delivered");
  const delivered = data.deliveries.filter((item) => item.fulfillment_status === "delivered").slice(-20).reverse();

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1280 }}>
      <DeliveryRealtime storeId={data.context.storeId} />
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Expedição e última milha</p>
          <h1 style={{ margin: "3px 0" }}>Entregas</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 780 }}>A taxa mostrada é a taxa já calculada e gravada no pedido. O endereço e o frete são revalidados no servidor antes da criação do pedido.</p>
        </div>
        <Link href="/configuracoes/entrega" className="muted">Configurar áreas e taxas →</Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <Metric label="Abertas" value={open.length} />
        <Metric label="Aguardando" value={open.filter((item) => ["pending","awaiting_assignment"].includes(item.fulfillment_status)).length} />
        <Metric label="Em rota" value={open.filter((item) => item.fulfillment_status === "out_for_delivery").length} />
        <Metric label="Entregadores em serviço" value={data.drivers.filter((driver) => driver.active && driver.on_duty).length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(300px, .65fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Fila operacional</h2>
          {open.length === 0 ? <article className="card" style={{ padding: 18 }}><p className="muted" style={{ margin: 0 }}>Nenhuma entrega aberta nesta unidade.</p></article> : null}
          {open.map((order) => {
            const delivery = order.delivery;
            const canStart = order.fulfillment_status === "pending" && ["ready","not_required"].includes(order.production_status);
            const canAssign = ["awaiting_assignment","assigned"].includes(order.fulfillment_status) || canStart;
            return (
              <article key={order.id} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>#{order.display_number} · {order.customer_name_snapshot}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{statusLabel[order.fulfillment_status] ?? order.fulfillment_status} · Produção: {order.production_status}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: "var(--accent)" }}>{money(order.delivery_fee_cents)} frete</strong>
                    <div style={{ fontSize: 12, marginTop: 3 }}><DeliverySla promisedByAt={delivery?.promised_by_at ?? null} deliveredAt={delivery?.delivered_at ?? null} /></div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
                  <Info label="Endereço" value={address(order) || "Endereço não informado"} />
                  <Info label="Telefone" value={order.customer_phone_snapshot || "Não informado"} />
                  <Info label="Entregador" value={delivery?.driver_id ? driverNames.get(delivery.driver_id) ?? "Entregador" : "Não atribuído"} />
                  <Info label="Estimativa" value={order.delivery_estimated_min_minutes && order.delivery_estimated_max_minutes ? `${order.delivery_estimated_min_minutes}–${order.delivery_estimated_max_minutes} min` : "—"} />
                </div>
                {order.address_reference_snapshot ? <div className="muted" style={{ fontSize: 12 }}>Referência: {order.address_reference_snapshot}</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 8, alignItems: "start" }}>
                  {canStart && !delivery ? <DeliveryOperationForm intent="waiting" orderId={order.id} /> : null}
                  {canAssign ? <DeliveryOperationForm intent="assign" orderId={order.id} drivers={driversForForm} currentDriverId={delivery?.driver_id ?? null} /> : null}
                  {order.fulfillment_status === "assigned" && delivery ? <DeliveryOperationForm intent="picked_up" deliveryId={delivery.id} /> : null}
                  {order.fulfillment_status === "picked_up" && delivery ? <DeliveryOperationForm intent="out_for_delivery" deliveryId={delivery.id} /> : null}
                  {order.fulfillment_status === "out_for_delivery" && delivery ? <DeliveryOperationForm intent="delivered" deliveryId={delivery.id} /> : null}
                </div>
              </article>
            );
          })}

          {delivered.length ? (
            <>
              <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Entregues recentes</h2>
              {delivered.map((order) => <article key={order.id} className="card" style={{ padding: 14, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>#{order.display_number} · {order.customer_name_snapshot}</strong><div className="muted" style={{ fontSize: 12 }}>{address(order)}</div></div><DeliverySla promisedByAt={order.delivery?.promised_by_at ?? null} deliveredAt={order.delivery?.delivered_at ?? null} /></article>)}
            </>
          ) : null}
        </div>

        <aside style={{ display: "grid", gap: 12 }}>
          <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Entregadores</h2>
            {data.drivers.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhum entregador cadastrado.</p> : data.drivers.map((driver) => (
              <div key={driver.id} style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{driver.name}</strong><span className="muted" style={{ fontSize: 11 }}>{driver.activeDeliveries}/{driver.max_active_deliveries}</span></div>
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{driver.active ? (driver.on_duty ? "Em serviço" : "Fora de serviço") : "Inativo"}{driver.user_id ? " · acesso vinculado" : " · sem login vinculado"}</div>
                {data.canManageDrivers ? <DriverUpdateForm driver={{ ...driver, max_active_deliveries: Number(driver.max_active_deliveries) }} /> : null}
              </div>
            ))}
          </article>
          {data.canManageDrivers ? <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Novo entregador</h2><p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>O vínculo de usuário é opcional; só é necessário para usar a visão mobile do entregador.</p></div><DriverCreateForm /></article> : null}
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 11 }}>{label.toUpperCase()}</span><strong style={{ display: "block", fontSize: 24, marginTop: 3 }}>{value}</strong></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><span className="muted" style={{ fontSize: 10 }}>{label.toUpperCase()}</span><div style={{ marginTop: 3, fontSize: 13 }}>{value}</div></div>; }
