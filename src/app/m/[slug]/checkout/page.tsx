import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  reviewCheckoutAction,
  saveCheckoutAddressAction,
  saveCheckoutFulfillmentAction,
  saveCheckoutIdentityAction,
  saveCheckoutPaymentAction,
} from "@/features/checkout/actions";
import { createOrderFromCheckoutAction } from "@/features/orders/actions";
import { cartCookieName } from "@/server/cart/cart-token";
import { CheckoutService } from "@/server/checkout/checkout-service";
import { paymentMethodLabels } from "@/server/checkout/schemas";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const errorMessages: Record<string, string> = {
  cart_empty: "Seu carrinho está vazio.",
  invalid_phone: "Informe um telefone válido.",
  pickup_disabled: "Retirada não está disponível nesta loja.",
  delivery_disabled: "Entrega não está disponível nesta loja.",
  delivery_not_selected: "Escolha entrega antes de informar o endereço.",
  delivery_minimum: "O pedido ainda não atingiu o mínimo exigido para este bairro.",
  neighborhood_not_served: "Este bairro ainda não é atendido pela loja.",
  payment_unavailable: "A forma de pagamento selecionada não está disponível.",
  invalid_change: "O valor informado para troco precisa ser igual ou maior que o total.",
  checkout_not_ready: "O checkout precisa ser revisado novamente antes de criar o pedido.",
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erro?: string; revisar?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const token = (await cookies()).get(cartCookieName(slug))?.value;
  if (!token) redirect(`/m/${slug}/carrinho`);

  const reviewed = query.revisar === "1" ? await CheckoutService.review(slug, token) : null;
  const data = reviewed ?? await CheckoutService.load(slug, token);
  const { cart, session, menu } = data;
  const review = reviewed?.review ?? null;
  const enabledMethods = data.paymentMethods.filter((item) => item.enabled);
  const selectedPayment = session?.payment_method ?? null;

  return (
    <main style={{ minHeight: "100vh", background: "#fffdf9", color: "#181818", padding: "18px 12px 64px" }}>
      <div style={{ width: "min(820px, 100%)", margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <Link href={`/m/${slug}/carrinho`} style={{ color: "#6f675f", fontWeight: 700 }}>← Voltar ao carrinho</Link>
          <strong>Pede<span style={{ color: "#FF6B00" }}>Aqui</span></strong>
        </div>

        <header>
          <p style={{ color: "#8a837b", margin: 0, fontSize: 13 }}>Finalização</p>
          <h1 style={{ margin: "4px 0" }}>Checkout</h1>
          <p style={{ color: "#716b64", margin: 0 }}>Preencha os dados abaixo. Tudo é validado novamente no servidor antes do pedido.</p>
        </header>

        {query.erro ? (
          <div role="alert" style={{ padding: 14, borderRadius: 14, background: "#fee4e2", color: "#9f281d", border: "1px solid #f8b4ad" }}>
            {errorMessages[query.erro] ?? "Não foi possível salvar esta etapa. Revise os dados e tente novamente."}
          </div>
        ) : null}

        <section style={sectionStyle}>
          <StepTitle number="1" title="Quem está pedindo?" complete={Boolean(session?.customer_name && session?.customer_phone_normalized)} />
          <form action={saveCheckoutIdentityAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="storeSlug" value={slug} />
            <div style={twoColumns}>
              <Field label="Nome" name="name" defaultValue={session?.customer_name ?? ""} required />
              <Field label="Telefone" name="phone" type="tel" defaultValue={session?.customer_phone ?? ""} placeholder="(19) 99999-9999" required />
            </div>
            <Field label="E-mail (opcional)" name="email" type="email" defaultValue={session?.customer_email ?? ""} />
            <div><ActionButton>Salvar identificação</ActionButton></div>
          </form>
        </section>

        <section style={sectionStyle}>
          <StepTitle number="2" title="Como você quer receber?" complete={Boolean(session?.fulfillment_type)} />
          <form action={saveCheckoutFulfillmentAction} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <input type="hidden" name="storeSlug" value={slug} />
            {menu.settings.allow_delivery && menu.delivery.enabled ? (
              <button type="submit" name="fulfillmentType" value="delivery" style={choiceStyle(session?.fulfillment_type === "delivery")}>Entrega<span style={choiceDetail}>Receba no endereço informado</span></button>
            ) : null}
            {menu.settings.allow_pickup ? (
              <button type="submit" name="fulfillmentType" value="pickup" style={choiceStyle(session?.fulfillment_type === "pickup")}>Retirada<span style={choiceDetail}>Você busca no estabelecimento</span></button>
            ) : null}
          </form>
        </section>

        {session?.fulfillment_type === "delivery" ? (
          <section style={sectionStyle}>
            <StepTitle number="3" title="Endereço de entrega" complete={session.delivery_quote_status === "valid"} />
            <form action={saveCheckoutAddressAction} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="storeSlug" value={slug} />
              <div style={twoColumns}>
                <Field label="CEP" name="postalCode" defaultValue={session.address_postal_code ?? ""} required />
                <Field label="Bairro" name="district" defaultValue={session.address_district ?? ""} required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px", gap: 10 }}>
                <Field label="Rua" name="street" defaultValue={session.address_street ?? ""} required />
                <Field label="Número" name="number" defaultValue={session.address_number ?? ""} required />
              </div>
              <Field label="Complemento" name="complement" defaultValue={session.address_complement ?? ""} />
              <div style={twoColumns}>
                <Field label="Cidade" name="city" defaultValue={session.address_city ?? menu.store.city ?? ""} required />
                <Field label="UF" name="state" defaultValue={session.address_state ?? menu.store.state ?? ""} maxLength={2} required />
              </div>
              <Field label="Referência" name="reference" defaultValue={session.address_reference ?? ""} />
              {session.delivery_quote_status === "valid" ? (
                <div style={{ padding: 12, borderRadius: 12, background: "#ecfdf3", color: "#166534", fontSize: 13 }}>
                  Entrega validada · {money(Number(session.delivery_fee_cents))} · {session.delivery_estimated_min_minutes}–{session.delivery_estimated_max_minutes} min
                </div>
              ) : session.delivery_quote_status === "unserviceable" ? (
                <div style={{ padding: 12, borderRadius: 12, background: "#fee4e2", color: "#9f281d", fontSize: 13 }}>Este endereço não está apto para entrega com as regras atuais.</div>
              ) : null}
              <div><ActionButton>Validar endereço e frete</ActionButton></div>
            </form>
          </section>
        ) : null}

        <section style={sectionStyle}>
          <StepTitle number={session?.fulfillment_type === "delivery" ? "4" : "3"} title="Forma de pagamento" complete={Boolean(selectedPayment)} />
          <form action={saveCheckoutPaymentAction} style={{ display: "grid", gap: 10 }}>
            <input type="hidden" name="storeSlug" value={slug} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              {enabledMethods.map((item) => (
                <label key={item.method} style={choiceStyle(selectedPayment === item.method)}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="radio" name="paymentMethod" value={item.method} defaultChecked={selectedPayment === item.method} required />
                    <strong>{paymentMethodLabels[item.method]}</strong>
                  </span>
                </label>
              ))}
            </div>
            {selectedPayment === "cash" ? (
              <Field label="Troco para (opcional)" name="changeFor" inputMode="decimal" defaultValue={session?.cash_change_for_cents ? (Number(session.cash_change_for_cents) / 100).toFixed(2).replace(".", ",") : ""} placeholder="Ex.: 100,00" />
            ) : null}
            <div><ActionButton>Salvar pagamento</ActionButton></div>
          </form>
        </section>

        <section style={{ ...sectionStyle, background: "#171717", color: "#fffdf9", borderColor: "#353535" }}>
          <div style={{ display: "grid", gap: 8 }}>
            <SummaryLine label="Subtotal" value={money(Number(cart.subtotal_cents))} />
            <SummaryLine label="Entrega" value={Number(cart.delivery_fee_cents) > 0 ? money(Number(cart.delivery_fee_cents)) : "Grátis / não aplicável"} />
            <div style={{ height: 1, background: "#353535" }} />
            <SummaryLine label="Total" value={money(Number(cart.total_cents))} strong />
          </div>

          {review ? (
            review.ready ? (
              <div style={{ padding: 14, borderRadius: 14, background: "#15351f", color: "#bdf4ca" }}>
                <strong>Checkout validado.</strong>
                <div style={{ marginTop: 4, fontSize: 13 }}>Os dados foram revalidados. Você já pode confirmar e enviar o pedido ao estabelecimento.</div>
              </div>
            ) : (
              <div style={{ padding: 14, borderRadius: 14, background: "#3a211b", color: "#ffd0c4", display: "grid", gap: 6 }}>
                <strong>Antes de criar o pedido:</strong>
                {review.blockers.map((blocker) => <div key={blocker.code} style={{ fontSize: 13 }}>• {blocker.message}</div>)}
              </div>
            )
          ) : null}

          {review?.ready ? (
            <form action={createOrderFromCheckoutAction}>
              <input type="hidden" name="storeSlug" value={slug} />
              <button type="submit" style={{ width: "100%", minHeight: 52, border: 0, borderRadius: 14, background: "#FF6B00", color: "#fff", fontWeight: 950, fontSize: 16 }}>Confirmar pedido</button>
            </form>
          ) : (
            <form action={reviewCheckoutAction}>
              <input type="hidden" name="storeSlug" value={slug} />
              <button type="submit" style={{ width: "100%", minHeight: 50, border: 0, borderRadius: 14, background: "#FF6B00", color: "#fff", fontWeight: 950, fontSize: 16 }}>Revisar pedido</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

function StepTitle({ number, title, complete }: { number: string; title: string; complete: boolean }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: complete ? "#dcfce7" : "#fff0e3", color: complete ? "#166534" : "#FF6B00", fontWeight: 950 }}>{complete ? "✓" : number}</span><h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2></div>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return <label style={{ display: "grid", gap: 5 }}><span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span><input {...inputProps} style={{ minHeight: 44, border: "1px solid #e5ded6", borderRadius: 11, padding: "10px 12px", background: "#fff", color: "#181818" }} /></label>;
}

function ActionButton({ children }: { children: React.ReactNode }) {
  return <button type="submit" style={{ minHeight: 42, border: 0, borderRadius: 11, padding: "9px 14px", background: "#FF6B00", color: "#fff", fontWeight: 900 }}>{children}</button>;
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: strong ? 20 : 14 }}><span>{label}</span><strong style={strong ? { color: "#FF6B00" } : undefined}>{value}</strong></div>;
}

const sectionStyle: React.CSSProperties = { padding: 18, background: "#fff", border: "1px solid #eee7df", borderRadius: 20, display: "grid", gap: 14 };
const twoColumns: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 };
const choiceDetail: React.CSSProperties = { display: "block", marginTop: 4, fontSize: 12, color: "#716b64", fontWeight: 500 };
function choiceStyle(active: boolean): React.CSSProperties {
  return { display: "grid", gap: 4, textAlign: "left", border: `1px solid ${active ? "#FF6B00" : "#e5ded6"}`, background: active ? "#fff4eb" : "#fff", color: "#181818", borderRadius: 14, padding: 14, fontWeight: 900, cursor: "pointer" };
}
