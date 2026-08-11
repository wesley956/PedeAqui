import { Button } from "@/components/ui/button";
import { savePaymentMethodsAction } from "@/features/payments/actions";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";

export default async function PaymentSettingsPage() {
  const methods = await StorePaymentMethodService.listCurrentStore();

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 760 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Formas de pagamento</h1>
        <p className="muted" style={{ margin: 0 }}>Defina o que o cliente pode escolher no checkout desta unidade.</p>
      </header>

      <form action={savePaymentMethodsAction} className="card" style={{ padding: 20, display: "grid", gap: 12 }}>
        {methods.map((item) => (
          <label key={item.method} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 14, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" }}>
            <div>
              <strong>{paymentMethodLabels[item.method]}</strong>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{item.method === "cash" ? "Permite informar troco no checkout." : "Pagamento registrado no pedido; processamento online entra em etapa futura."}</div>
            </div>
            <input type="checkbox" name="method" value={item.method} defaultChecked={item.enabled} aria-label={`Ativar ${paymentMethodLabels[item.method]}`} />
          </label>
        ))}
        <div style={{ marginTop: 8 }}><Button type="submit">Salvar formas de pagamento</Button></div>
      </form>
    </section>
  );
}
