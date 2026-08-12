import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DeliverySla } from "@/features/delivery/delivery-sla";
import { DeliveryOperationForm } from "@/features/delivery/operation-forms";

function address(order: NonNullable<Awaited<ReturnType<typeof DeliveryOperationsService.loadDriverView>>["deliveries"][number]["order"]>) {
  const line = [order.address_street_snapshot, order.address_number_snapshot].filter(Boolean).join(", ");
  return [line, order.address_complement_snapshot, order.address_district_snapshot, [order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}
const statusLabel: Record<string, string> = { assigned: "Aguardando retirada", picked_up: "Retirado", out_for_delivery: "Em rota", delivered: "Entregue" };

export default async function DriverPage() {
  const data = await DeliveryOperationsService.loadDriverView();
  if (!data.context.storeId) throw new Error("Uma unidade ativa é necessária");
  const active = data.deliveries.filter((item) => item.order && item.order.fulfillment_status !== "delivered");
  const recent = data.deliveries.filter((item) => item.order?.fulfillment_status === "delivered").slice(0, 10);

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 760, margin: "0 auto" }}>
      <DeliveryRealtime storeId={data.context.storeId} />
      <header>
        <p className="muted" style={{ margin: 0 }}>Operação mobile</p>
        <h1 style={{ margin: "3px 0" }}>Minhas entregas</h1>
        <p className="muted" style={{ margin: 0 }}>{data.driver.name} · {data.driver.active ? (data.driver.on_duty ? "em serviço" : "fora de serviço") : "inativo"}</p>
      </header>

      {!data.driver.active || !data.driver.on_duty ? <article className="card" style={{ padding: 16, border: "1px solid #f59e0b" }}><strong>Você está fora de serviço.</strong><p className="muted" style={{ margin: "5px 0 0", fontSize: 12 }}>As entregas já atribuídas continuam visíveis, mas novas atribuições são bloqueadas até o status ser alterado pela operação.</p></article> : null}

      {active.length === 0 ? <article className="card" style={{ padding: 20 }}><strong>Nenhuma entrega ativa.</strong><p className="muted" style={{ margin: "5px 0 0" }}>Quando uma entrega for atribuída ao seu usuário ela aparecerá aqui automaticamente.</p></article> : active.map((item) => {
        const order = item.order!;
        return (
          <article key={item.id} className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}>
              <div><strong style={{ fontSize: 20 }}>#{order.display_number} · {order.customer_name_snapshot}</strong><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{statusLabel[order.fulfillment_status] ?? order.fulfillment_status}</div></div>
              <DeliverySla promisedByAt={item.promised_by_at} deliveredAt={item.delivered_at} />
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: 14, display: "grid", gap: 7 }}>
              <strong>{address(order)}</strong>
              {order.address_reference_snapshot ? <span className="muted" style={{ fontSize: 12 }}>Referência: {order.address_reference_snapshot}</span> : null}
              {order.customer_phone_snapshot ? <a href={`tel:${order.customer_phone_snapshot}`} style={{ color: "var(--accent)", fontWeight: 800 }}>{order.customer_phone_snapshot}</a> : null}
            </div>
            {order.fulfillment_status === "assigned" ? <DeliveryOperationForm intent="picked_up" deliveryId={item.id} /> : null}
            {order.fulfillment_status === "picked_up" ? <DeliveryOperationForm intent="out_for_delivery" deliveryId={item.id} /> : null}
            {order.fulfillment_status === "out_for_delivery" ? <DeliveryOperationForm intent="delivered" deliveryId={item.id} /> : null}
          </article>
        );
      })}

      {recent.length ? <div style={{ display: "grid", gap: 8 }}><h2 style={{ margin: "6px 0 0", fontSize: 17 }}>Entregues recentemente</h2>{recent.map((item) => item.order ? <article key={item.id} className="card" style={{ padding: 12 }}><strong>#{item.order.display_number} · {item.order.customer_name_snapshot}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{address(item.order)}</div></article> : null)}</div> : null}
    </section>
  );
}
