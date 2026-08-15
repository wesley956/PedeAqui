import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { InputHTMLAttributes, ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import {
  reviewCheckoutAction,
  saveCheckoutAddressAction,
  saveCheckoutFulfillmentAction,
  saveCheckoutIdentityAction,
  saveCheckoutPaymentAction,
  useSavedCheckoutAddressAction,
} from "@/features/checkout/actions";
import { CheckoutReviewState, FinalOrderOptions, paymentMethodHelp } from "@/features/checkout/final-order-options";
import { applyCheckoutBenefitsAction, clearCheckoutBenefitsAction } from "@/features/growth/actions";
import { createOrderFromCheckoutAction } from "@/features/orders/actions";
import { cartCookieName } from "@/server/cart/cart-token";
import { CheckoutService } from "@/server/checkout/checkout-service";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { customerRecognitionCookieName } from "@/server/customers/recognition-token";
import { GrowthService } from "@/server/growth/growth-service";
import styles from "./checkout.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

const errorMessages: Record<string, string> = {
  cart_empty: "Seu carrinho está vazio.",
  invalid_phone: "Informe um WhatsApp válido.",
  pickup_disabled: "Retirada não está disponível nesta loja.",
  delivery_disabled: "Entrega não está disponível nesta loja.",
  delivery_not_selected: "Escolha entrega antes de informar o endereço.",
  delivery_minimum: "O pedido ainda não atingiu o mínimo exigido para este bairro.",
  neighborhood_not_served: "Este bairro ainda não é atendido pela loja.",
  payment_unavailable: "A forma de pagamento selecionada não está disponível.",
  invalid_change: "O valor informado para troco precisa ser igual ou maior que o total.",
  checkout_not_ready: "Confira o pedido novamente antes de finalizar.",
  benefit_invalid: "Não foi possível aplicar esses benefícios. Confira o cupom e tente novamente.",
  saved_address_invalid: "Este endereço salvo não está mais disponível.",
  recognition_required: "Por segurança, informe o endereço novamente neste dispositivo.",
  identity_required: "Confirme seu nome e WhatsApp antes de reutilizar um endereço.",
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
  const cookieStore = await cookies();
  const token = cookieStore.get(cartCookieName(slug))?.value;
  if (!token) redirect(`/m/${slug}/carrinho`);

  const recognitionToken = cookieStore.get(customerRecognitionCookieName(slug))?.value ?? null;
  const reviewed = query.revisar === "1" ? await CheckoutService.review(slug, token, recognitionToken) : null;
  const data = reviewed ?? await CheckoutService.load(slug, token, recognitionToken);
  const benefits = await GrowthService.loadCheckoutBenefits(slug, token);
  const { cart, session, menu, recognizedCustomer } = data;
  const review = reviewed?.review ?? null;
  const enabledMethods = data.paymentMethods.filter((item) => item.enabled);
  const selectedPayment = session?.payment_method ?? null;
  const totalDiscount = Number(cart.discount_cents);
  const identityComplete = Boolean(session?.customer_name && session?.customer_phone_normalized);
  const fulfillmentComplete = Boolean(session?.fulfillment_type);
  const deliverySelected = session?.fulfillment_type === "delivery";
  const addressComplete = !deliverySelected || session?.delivery_quote_status === "valid";
  const paymentComplete = Boolean(selectedPayment);
  const reviewComplete = Boolean(review?.ready);
  const recognizedForSession = Boolean(recognizedCustomer && session?.customer_id && session.customer_id === recognizedCustomer.customerId);
  const identityName = session?.customer_name ?? recognizedCustomer?.customer.name ?? "";
  const identityPhone = session?.customer_phone ?? recognizedCustomer?.customer.phone ?? "";
  const identityEmail = session?.customer_email ?? recognizedCustomer?.customer.email ?? "";
  const totalSteps = deliverySelected ? 5 : 4;
  const completedSteps = [identityComplete, fulfillmentComplete, ...(deliverySelected ? [addressComplete] : []), paymentComplete, reviewComplete].filter(Boolean).length;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const fulfillmentSummary = deliverySelected ? "Entrega" : session?.fulfillment_type === "pickup" ? "Retirada no local" : "Escolha como receber";
  const addressSummary = session?.address_street && session?.address_number ? `${session.address_street}, ${session.address_number}` : "Informe o endereço";
  const paymentSummary = selectedPayment ? paymentMethodLabels[selectedPayment] : "Escolha a forma de pagamento";

  return (
    <main className={styles.root}>
      <div className={styles.container}>
        <div className={styles.topbar}>
          <Link href={`/m/${slug}/carrinho`} className={styles.back}>← Carrinho</Link>
          <PedeAquiLogo size="xs" decorative />
        </div>

        <header className={styles.header}>
          <p className={styles.eyebrow}>{menu.store.name}</p>
          <h1>Vamos finalizar seu pedido</h1>
          <p>É rápido: confirme seus dados, escolha como receber e a forma de pagamento.</p>
          <div className={styles.progressHeader}><strong>{completedSteps} de {totalSteps} etapas</strong><span>{progress}%</span></div>
          <div className={styles.progressTrack} aria-label={`${progress}% do checkout concluído`}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
        </header>

        {query.erro ? <div role="alert" className={`card ${styles.alert}`}>{errorMessages[query.erro] ?? "Não foi possível continuar. Confira os dados e tente novamente."}</div> : null}

        <Step number="1" title="Seus dados" summary={identityComplete ? `${session?.customer_name} · ${session?.customer_phone}` : "Nome e WhatsApp"} complete={identityComplete}>
          {recognizedCustomer && !identityComplete ? <p className="muted">Já encontramos dados usados anteriormente neste dispositivo. Confira antes de continuar.</p> : null}
          <form action={saveCheckoutIdentityAction} className={styles.form}>
            <input type="hidden" name="storeSlug" value={slug} />
            <div className={styles.grid2}>
              <Field label="Nome" name="name" autoComplete="name" defaultValue={identityName} required />
              <Field label="WhatsApp" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={identityPhone ?? ""} placeholder="(19) 99999-9999" required />
            </div>
            <Field label="E-mail (opcional)" name="email" type="email" autoComplete="email" defaultValue={identityEmail ?? ""} />
            <ActionButton>Continuar</ActionButton>
          </form>
        </Step>

        {identityComplete ? (
          <Step number="2" title="Como quer receber?" summary={fulfillmentSummary} complete={fulfillmentComplete}>
            <form action={saveCheckoutFulfillmentAction} className={styles.choices}>
              <input type="hidden" name="storeSlug" value={slug} />
              {menu.settings.allow_delivery && menu.delivery.enabled ? (
                <button type="submit" name="fulfillmentType" value="delivery" className={`${styles.choice} ${deliverySelected ? styles.choiceSelected : ""}`}>
                  <strong>🛵 Entrega</strong>
                  <span className={styles.choiceDetail}>Receba em casa · previsão de {menu.delivery.estimated_min_minutes}–{menu.delivery.estimated_max_minutes} min</span>
                </button>
              ) : null}
              {menu.settings.allow_pickup ? (
                <button type="submit" name="fulfillmentType" value="pickup" className={`${styles.choice} ${session?.fulfillment_type === "pickup" ? styles.choiceSelected : ""}`}>
                  <strong>🛍️ Retirar no local</strong>
                  <span className={styles.choiceDetail}>Você busca no estabelecimento · sem taxa de entrega</span>
                </button>
              ) : null}
            </form>
          </Step>
        ) : null}

        {identityComplete && fulfillmentComplete && deliverySelected ? (
          <Step number="3" title="Endereço de entrega" summary={addressComplete ? addressSummary : "Informe onde devemos entregar"} complete={addressComplete}>
            {recognizedForSession && recognizedCustomer && recognizedCustomer.addresses.length > 0 ? (
              <div className={styles.form}>
                <p className="muted">Você já pediu aqui. Pode usar um endereço salvo:</p>
                <div className={styles.choices}>
                  {recognizedCustomer.addresses.map((address, index) => (
                    <form action={useSavedCheckoutAddressAction} key={`${address.postalCode}-${address.street}-${address.number}-${index}`}>
                      <input type="hidden" name="storeSlug" value={slug} />
                      <input type="hidden" name="addressIndex" value={index} />
                      <button type="submit" className={styles.choice}>
                        <strong>{address.isDefault ? "📍 Endereço principal" : `📍 ${address.label}`}</strong>
                        <span className={styles.choiceDetail}>{address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ""}<br />{address.district} · {address.city}/{address.state}</span>
                      </button>
                    </form>
                  ))}
                </div>
                <p className="muted">Ou informe outro endereço:</p>
              </div>
            ) : recognizedCustomer && identityComplete && !recognizedForSession ? <div className={styles.deliveryError}>Por segurança, confirme o endereço novamente para este WhatsApp.</div> : null}

            <form action={saveCheckoutAddressAction} className={styles.form}>
              <input type="hidden" name="storeSlug" value={slug} />
              <div className={styles.grid2}>
                <Field label="CEP" name="postalCode" inputMode="numeric" autoComplete="postal-code" defaultValue={session?.address_postal_code ?? ""} required />
                <Field label="Bairro" name="district" autoComplete="address-level3" defaultValue={session?.address_district ?? ""} required />
              </div>
              <div className={styles.addressRow}>
                <Field label="Rua" name="street" autoComplete="street-address" defaultValue={session?.address_street ?? ""} required />
                <Field label="Número" name="number" defaultValue={session?.address_number ?? ""} required />
              </div>
              <Field label="Complemento (opcional)" name="complement" defaultValue={session?.address_complement ?? ""} />
              <div className={styles.grid2}>
                <Field label="Cidade" name="city" autoComplete="address-level2" defaultValue={session?.address_city ?? menu.store.city ?? ""} required />
                <Field label="UF" name="state" autoComplete="address-level1" defaultValue={session?.address_state ?? menu.store.state ?? ""} maxLength={2} required />
              </div>
              <Field label="Referência (opcional)" name="reference" defaultValue={session?.address_reference ?? ""} placeholder="Ex.: portão preto" />
              {session?.delivery_quote_status === "valid" ? <div className={styles.deliveryOk}><strong>Entrega disponível</strong><br />{money(Number(session.delivery_fee_cents))} · previsão de {session.delivery_estimated_min_minutes}–{session.delivery_estimated_max_minutes} min</div> : null}
              {session?.delivery_quote_status === "unserviceable" ? <div className={styles.deliveryError}>Ainda não entregamos neste endereço. Você pode editar os dados ou escolher retirada.</div> : null}
              <ActionButton>{recognizedForSession ? "Usar este endereço" : "Continuar"}</ActionButton>
            </form>
          </Step>
        ) : null}

        {identityComplete && fulfillmentComplete && addressComplete ? (
          <Step number={deliverySelected ? "4" : "3"} title="Pagamento" summary={paymentSummary} complete={paymentComplete}>
            <form action={saveCheckoutPaymentAction} className={styles.form}>
              <input type="hidden" name="storeSlug" value={slug} />
              {enabledMethods.length === 0 ? <div className={styles.deliveryError}>Este estabelecimento não tem uma forma de pagamento disponível no momento.</div> : (
                <div className={styles.choices}>
                  {enabledMethods.map((item) => (
                    <label key={item.method} className={`${styles.choice} ${selectedPayment === item.method ? styles.choiceSelected : ""}`}>
                      <span className={styles.paymentChoice}><input type="radio" name="paymentMethod" value={item.method} defaultChecked={selectedPayment === item.method} required /><strong>{paymentMethodLabels[item.method]}</strong></span>
                      <span className={styles.choiceDetail}>{paymentMethodHelp[item.method]}</span>
                    </label>
                  ))}
                </div>
              )}
              {selectedPayment === "cash" ? <Field label="Troco para (opcional)" name="changeFor" inputMode="decimal" defaultValue={session?.cash_change_for_cents ? (Number(session.cash_change_for_cents) / 100).toFixed(2).replace(".", ",") : ""} placeholder="Ex.: 100,00" /> : null}
              {enabledMethods.length > 0 ? <ActionButton>Continuar</ActionButton> : null}
            </form>
          </Step>
        ) : null}

        {paymentComplete ? (
          <details className={styles.optional} open={totalDiscount > 0}>
            <summary>Tenho cupom, cashback ou pontos{totalDiscount > 0 ? ` · economia ${money(totalDiscount)}` : ""}</summary>
            <div className={styles.optionalBody}>
              <form action={applyCheckoutBenefitsAction} className={styles.form}>
                <input type="hidden" name="storeSlug" value={slug} />
                <div className={styles.grid2}>
                  <Field label="Cupom" name="couponCode" defaultValue={benefits.current.couponCode ?? ""} placeholder="Ex.: VOLTA20" />
                  <Field label={`Cashback${benefits.customerIdentified ? ` · saldo ${money(benefits.cashbackBalanceCents)}` : ""}`} name="cashbackAmount" inputMode="decimal" defaultValue={benefits.current.cashbackRedeemCents ? (benefits.current.cashbackRedeemCents / 100).toFixed(2).replace(".", ",") : ""} disabled={!benefits.cashbackEnabled || !benefits.customerIdentified} />
                  <Field label={`Pontos${benefits.customerIdentified ? ` · saldo ${benefits.loyaltyBalancePoints}` : ""}`} name="loyaltyPoints" type="number" min={0} defaultValue={benefits.current.loyaltyRedeemPoints || ""} disabled={!benefits.loyaltyEnabled || !benefits.customerIdentified} />
                </div>
                <div className={styles.benefitActions}>
                  <ActionButton>Aplicar benefício</ActionButton>
                  {totalDiscount > 0 ? <button formAction={clearCheckoutBenefitsAction} type="submit" className={styles.secondary}>Remover</button> : null}
                </div>
              </form>
              {totalDiscount > 0 ? <div className={styles.benefitSummary}><strong>Você economizou {money(totalDiscount)}</strong></div> : null}
            </div>
          </details>
        ) : null}

        {paymentComplete ? (
          <section className={`card ${styles.review}`}>
            <div className={styles.reviewTop}>
              <p className={styles.eyebrow}>Quase pronto</p>
              <h2>Confira seu pedido</h2>
              <p>Veja os principais dados antes de enviar para {menu.store.name}.</p>
            </div>
            <FinalOrderOptions
              fulfillmentType={session?.fulfillment_type}
              address={{ street: session?.address_street, number: session?.address_number, district: session?.address_district }}
              deliveryMinutes={{ min: session?.delivery_estimated_min_minutes, max: session?.delivery_estimated_max_minutes }}
              paymentMethod={selectedPayment}
              cashChangeForCents={session?.cash_change_for_cents === null || session?.cash_change_for_cents === undefined ? null : Number(session.cash_change_for_cents)}
            />
            <div className={styles.summaryRows}>
              <SummaryLine label="Subtotal" value={money(Number(cart.subtotal_cents))} />
              {totalDiscount > 0 ? <SummaryLine label="Descontos" value={`− ${money(totalDiscount)}`} /> : null}
              <SummaryLine label="Entrega" value={Number(cart.delivery_fee_cents) > 0 ? money(Number(cart.delivery_fee_cents)) : deliverySelected ? "Grátis" : "Retirada"} />
              <div className={styles.divider} />
              <SummaryLine label="Total" value={money(Number(cart.total_cents))} strong />
            </div>
            <CheckoutReviewState reviewed={Boolean(review)} ready={Boolean(review?.ready)} />
            {review && !review.ready ? <div className={styles.reviewError}><strong>Confira antes de continuar:</strong><div className={styles.blockers}>{review.blockers.map((blocker) => <span key={blocker.code}>• {blocker.message}</span>)}</div></div> : null}
            {review?.ready ? (
              <form action={createOrderFromCheckoutAction}>
                <input type="hidden" name="storeSlug" value={slug} />
                <button type="submit" className={styles.finalAction}>Fazer pedido · {money(Number(cart.total_cents))}</button>
              </form>
            ) : (
              <form action={reviewCheckoutAction}>
                <input type="hidden" name="storeSlug" value={slug} />
                <button type="submit" className={styles.finalAction}>Conferir pedido</button>
              </form>
            )}
          </section>
        ) : null}
      </div>

      <div className={styles.stickySummary} aria-hidden="true">
        <div className={styles.stickyInner}><span>Seu pedido</span><strong>{money(Number(cart.total_cents))}</strong></div>
      </div>
    </main>
  );
}

function Step({ number, title, summary, complete, children }: { number: string; title: string; summary: string; complete: boolean; children: ReactNode }) {
  return (
    <details className={`${styles.step} ${complete ? styles.stepComplete : ""}`} open={!complete}>
      <summary className={styles.stepSummary}>
        <span className={styles.stepBadge}>{complete ? "✓" : number}</span>
        <span className={styles.stepCopy}><strong>{title}</strong><span>{summary}</span></span>
        {complete ? <span className={styles.edit}>Editar</span> : null}
      </summary>
      <div className={styles.stepBody}>{children}</div>
    </details>
  );
}

function Field({ label, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={styles.field}><span>{label}</span><input {...input} className={styles.input} /></label>;
}

function ActionButton({ children }: { children: ReactNode }) {
  return <button type="submit" className={styles.action}>{children}</button>;
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`${styles.summaryLine} ${strong ? styles.total : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}
