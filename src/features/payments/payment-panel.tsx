import { AuthorizationError } from "@/server/access/authorize";
import { PaymentService } from "@/server/payments/payment-service";
import { PaymentActionForm } from "@/features/payments/payment-action-form";

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  authorized: "Autorizado",
  paid: "Pago",
  failed: "Falhou",
  canceled: "Cancelado",
  refunded: "Estornado",
};
const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
};

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}
function moneyInput(cents: number | string) {
  return (Number(cents) / 100).toFixed(2).replace(".", ",");
}

export async function PaymentPanel({ orderId }: { orderId: string }) {
  let ledger: Awaited<ReturnType<typeof PaymentService.listForOrder>>;
  try {
    ledger = await PaymentService.listForOrder(orderId);
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }

  const { payments, summary } = ledger;
  return (
    <article className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Pagamentos</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>Ledger financeiro do pedido. O status do pedido só vira pago quando a soma confirmada cobre o total.</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 11 }}>PAGO / RESTANTE</div>
          <strong>{money(summary.paidCents)} / {money(summary.remainingCents)}</strong>
        </div>
      </div>

      {payments.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhum pagamento registrado.</p> : payments.map((payment) => {
        const open = ["pending", "authorized"].includes(payment.status);
        return (
          <div key={payment.id} style={{ display: "grid", gap: 7, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{methodLabels[payment.method] ?? payment.method}</strong>
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{statusLabels[payment.status] ?? payment.status} · {payment.source}</div>
              </div>
              <strong style={{ color: payment.status === "paid" ? "#22c55e" : undefined }}>{money(payment.amount_cents)}</strong>
            </div>
            {payment.reference ? <div className="muted" style={{ fontSize: 12 }}>Referência: {payment.reference}</div> : null}
            {payment.method === "cash" && payment.cash_tendered_cents ? <div className="muted" style={{ fontSize: 12 }}>Recebido/troco para: {money(payment.cash_tendered_cents)}</div> : null}
            {payment.method === "cash" && payment.change_due_cents !== null ? <div className="muted" style={{ fontSize: 12 }}>Troco devido: {money(payment.change_due_cents)}</div> : null}
            {payment.paid_at ? <div className="muted" style={{ fontSize: 11 }}>Confirmado em {new Date(payment.paid_at).toLocaleString("pt-BR")}</div> : null}
            {payment.failed_at ? <div className="muted" style={{ fontSize: 11 }}>Falhou em {new Date(payment.failed_at).toLocaleString("pt-BR")}</div> : null}

            {open ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <PaymentActionForm
                  orderId={orderId}
                  paymentId={payment.id}
                  method={payment.method}
                  intent="confirm"
                  defaultCashReceived={payment.method === "cash" ? moneyInput(payment.cash_tendered_cents ?? payment.amount_cents) : null}
                />
                <PaymentActionForm orderId={orderId} paymentId={payment.id} method={payment.method} intent="fail" />
              </div>
            ) : null}
          </div>
        );
      })}

      {payments.length > 1 ? (
        <div className="muted" style={{ fontSize: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          Pagamento dividido preparado: cada linha é confirmada separadamente; o pedido permanece pendente enquanto houver saldo restante.
        </div>
      ) : null}
    </article>
  );
}
