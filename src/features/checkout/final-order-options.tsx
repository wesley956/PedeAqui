import { paymentMethodLabels, type PaymentMethod } from "@/server/checkout/schemas";
import styles from "./final-order-options.module.css";

export const paymentMethodHelp: Record<PaymentMethod, string> = {
  pix: "Pix online com QR Code e confirmação automática. Para usar, informe seu e-mail em Seus dados.",
  credit_card: "Cartão de crédito habilitado pelo estabelecimento.",
  debit_card: "Cartão de débito habilitado pelo estabelecimento.",
  cash: "Dinheiro; informe troco somente se precisar.",
};

export function CheckoutReviewState({ reviewed, ready }: { reviewed: boolean; ready: boolean }) {
  const className = !reviewed ? styles.pending : ready ? styles.ready : styles.attention;
  const label = !reviewed ? "Pendente de revisão" : ready ? "Pronto para confirmar" : "Ajustes necessários";
  return <span className={`${styles.state} ${className}`}>{ready ? "✓" : reviewed ? "!" : "○"} {label}</span>;
}

export function FinalOrderOptions({ fulfillmentType, address, deliveryMinutes, paymentMethod, cashChangeForCents }: {
  fulfillmentType: "delivery" | "pickup" | null | undefined;
  address?: { street?: string | null; number?: string | null; district?: string | null } | null;
  deliveryMinutes?: { min?: number | null; max?: number | null } | null;
  paymentMethod: PaymentMethod | null | undefined;
  cashChangeForCents?: number | null;
}) {
  const delivery = fulfillmentType === "delivery";
  const destination = delivery ? [address?.street, address?.number, address?.district].filter(Boolean).join(", ") : "Retirada no estabelecimento";
  const deliveryDetail = delivery && deliveryMinutes?.min && deliveryMinutes?.max ? `${deliveryMinutes.min}–${deliveryMinutes.max} min após validação` : destination;
  const payment = paymentMethod ? paymentMethodLabels[paymentMethod] : "Não selecionado";
  const paymentDetail = paymentMethod === "cash" ? cashChangeForCents ? `Troco para ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cashChangeForCents / 100)}` : "Sem troco informado" : paymentMethod ? paymentMethodHelp[paymentMethod] : "Escolha uma forma habilitada pela loja";
  return <div className={styles.summary} aria-label="Opções finais do pedido">
    <div className={styles.option}><span className={styles.label}>Recebimento</span><span className={styles.value}>{delivery ? "Entrega" : fulfillmentType === "pickup" ? "Retirada" : "Não selecionado"}</span><span className={styles.detail}>{delivery ? `${destination || "Endereço pendente"}${deliveryDetail !== destination ? ` · ${deliveryDetail}` : ""}` : destination}</span></div>
    <div className={styles.option}><span className={styles.label}>Pagamento</span><span className={styles.value}>{payment}</span><span className={styles.detail}>{paymentDetail}</span></div>
  </div>;
}
