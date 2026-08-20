import type { FulfillmentType } from "@/server/checkout/schemas";
import { orderStatusLabels, type FulfillmentStatus, type OrderStatus, type ProductionStatus } from "@/server/orders/state-machines";
import { businessVocabulary, productionStatusLabelForBusiness } from "@/modules/business-vocabulary";
import type { BusinessType } from "@/modules/module-catalog";
import styles from "./public-order-timeline.module.css";

type TimelineState = "done" | "current" | "upcoming";
type TimelineStep = { key: string; label: string; detail: string; reached: boolean };

const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  pending: "Aguardando operação",
  awaiting_assignment: "Aguardando entregador",
  assigned: "Entregador definido",
  picked_up: "Pedido retirado pelo entregador",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  awaiting_pickup: "Aguardando retirada",
  picked_up_by_customer: "Retirado pelo cliente",
  served: "Servido",
  canceled: "Cancelado",
  not_required: "Não aplicável",
};

export function buildPublicOrderTimeline(input: { fulfillmentType: FulfillmentType; orderStatus: OrderStatus; productionStatus: ProductionStatus; fulfillmentStatus: FulfillmentStatus; businessType?: BusinessType }) {
  const businessType = input.businessType ?? "restaurant";
  const vocabulary = businessVocabulary(businessType);
  const confirmed = input.orderStatus === "confirmed" || input.orderStatus === "completed";
  const productionRequired = input.productionStatus !== "not_required";
  const preparing = input.productionStatus === "queued" || input.productionStatus === "preparing" || input.productionStatus === "ready";
  const ready = input.productionStatus === "ready";
  const deliveryOut = input.fulfillmentStatus === "out_for_delivery" || input.fulfillmentStatus === "delivered";
  const delivered = input.fulfillmentStatus === "delivered";
  const pickedUp = input.fulfillmentStatus === "picked_up_by_customer";

  const steps: TimelineStep[] = [
    { key: "received", label: "Pedido recebido", detail: "Seu pedido entrou no PedeAqui", reached: true },
    { key: "confirmed", label: "Confirmado", detail: orderStatusLabels[input.orderStatus], reached: confirmed },
  ];
  if (productionRequired) {
    steps.push({ key: "preparing", label: vocabulary.productionLabel, detail: productionStatusLabelForBusiness(input.productionStatus, businessType), reached: preparing });
    steps.push({ key: "ready", label: vocabulary.readyLabel, detail: ready ? (input.fulfillmentType === "delivery" ? `${vocabulary.readyLabel} para seguir com a entrega` : `${vocabulary.readyLabel} para retirada`) : `Aguardando conclusão da ${vocabulary.productionLabel.toLowerCase()}`, reached: ready });
  }
  if (input.fulfillmentType === "delivery") {
    steps.push({ key: "out", label: "Saiu para entrega", detail: fulfillmentLabels[input.fulfillmentStatus], reached: deliveryOut });
    steps.push({ key: "delivered", label: "Entregue", detail: fulfillmentLabels[input.fulfillmentStatus], reached: delivered });
  } else {
    steps.push({ key: "pickup", label: "Retirado", detail: fulfillmentLabels[input.fulfillmentStatus], reached: pickedUp });
  }

  let currentIndex = 0;
  steps.forEach((step, index) => { if (step.reached) currentIndex = index; });
  return steps.map((step, index) => ({ ...step, state: (index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming") as TimelineState }));
}

export function PublicOrderTimeline(props: { fulfillmentType: FulfillmentType; orderStatus: OrderStatus; productionStatus: ProductionStatus; fulfillmentStatus: FulfillmentStatus; businessType?: BusinessType }) {
  const terminalProblem = props.orderStatus === "canceled" || props.orderStatus === "rejected";
  const steps = buildPublicOrderTimeline(props);
  return <div className={styles.timeline} aria-label="Progresso do pedido">
    {steps.map((step) => <div key={step.key} className={`${styles.step} ${styles[step.state]}`} aria-current={step.state === "current" ? "step" : undefined}>
      <span className={styles.marker} aria-hidden>{step.state === "done" ? "✓" : step.state === "current" ? terminalProblem ? "!" : "•" : ""}</span>
      <div className={styles.copy}><strong>{step.label}</strong><span>{step.detail}</span></div>
    </div>)}
  </div>;
}
