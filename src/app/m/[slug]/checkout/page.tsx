import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { InputHTMLAttributes } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { removeCartItemAction, updateCartQuantityAction } from "@/features/cart/actions";
import { applyCheckoutBenefitsAction, clearCheckoutBenefitsAction } from "@/features/checkout/benefit-actions";
import { CheckoutInput } from "@/features/checkout/checkout-input";
import { ExpressCheckoutForm } from "@/features/checkout/express-checkout-form";
import { paymentMethodHelp } from "@/features/checkout/final-order-options";
import { ScrollToActiveStage } from "@/features/checkout/scroll-to-active-stage";
import { StoreOrderStatus } from "@/features/menu/store-order-status";
import { cartCookieName } from "@/server/cart/cart-token";
import { CheckoutService } from "@/server/checkout/checkout-service";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import { customerRecognitionCookieName } from "@/server/customers/recognition-token";
import { GrowthService } from "@/server/growth/growth-service";
import styles from "./checkout.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function dateTimeLocalValue(iso: string | null, timeZone: string) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

const errorMessages: Record<string, string> = {
  cart_empty: "Seu carrinho está vazio.", invalid_phone: "Informe um WhatsApp válido.", invalid_identity: "Confira seu nome, WhatsApp e e-mail.",
  invalid_fulfillment: "Escolha entrega ou retirada.", invalid_address: "Confira rua, número e selecione um bairro atendido.",
  invalid_payment: "Escolha uma forma de pagamento válida.", invalid_schedule: "Escolha um horário válido entre 15 minutos e 7 dias a partir de agora.",
  pickup_disabled: "Retirada não está disponível nesta loja.", delivery_disabled: "Entrega não está disponível nesta loja.",
  delivery_not_selected: "Escolha entrega antes de informar o endereço.", delivery_minimum: "O pedido ainda não atingiu o mínimo exigido para este bairro.",
  neighborhood_not_served: "Selecione um bairro atendido pela loja.", payment_unavailable: "A forma de pagamento selecionada não está disponível.",
  invalid_change: "O valor informado para troco precisa ser igual ou maior que o total.", pix_email_required: "Informe seu e-mail em Pagamento para gerar o Pix online.", invalid_payment_email: "Informe um e-mail válido para o Pix.",
  checkout_not_ready: "Não foi possível confirmar o pedido. Confira o motivo abaixo e faça o ajuste necessário.", benefit_invalid: "Não foi possível aplicar esses benefícios. Confira o cupom e tente novamente.",
  benefit_unavailable: "Benefícios não estão disponíveis nesta loja.", saved_address_invalid: "Este endereço salvo não está mais disponível.",
  recognition_required: "Por segurança, informe o endereço novamente neste dispositivo.", identity_required: "Confirme seu nome e WhatsApp antes de reutilizar um endereço.",
  total_updated: "Calculamos a entrega. Confira o total e toque em Confirmar pedido.",
};

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(cartCookieName(slug))?.value;
  if (!token) redirect(`/m/${slug}/carrinho`);

  const recognitionToken = cookieStore.get(customerRecognitionCookieName(slug))?.value ?? null;
  const data = await CheckoutService.load(slug, token, recognitionToken);
  const benefits = data.growthEnabled ? await GrowthService.loadCheckoutBenefits(slug, token) : null;
  const { cart, session, menu, recognizedCustomer, deliveryNeighborhoods, growthEnabled } = data;
  const reviewAfterFailure = query.erro === "checkout_not_ready" ? await CheckoutService.review(slug, token) : null;
  const enabledMethods = data.paymentMethods.filter((item) => item.enabled);
  const selectedPayment = session?.payment_method ?? null;
  const selectedPaymentValue = selectedPayment === "custom" && session?.custom_payment_method_id ? `custom:${session.custom_payment_method_id}` : selectedPayment;
  const totalDiscount = Number(cart.discount_cents);
  const deliverySelected = session?.fulfillment_type === "delivery";
  const recognizedForSession = Boolean(recognizedCustomer && session?.customer_id && session.customer_id === recognizedCustomer.customerId);
  const identityName = session?.customer_name ?? recognizedCustomer?.customer.name ?? "";
  const identityPhone = session?.customer_phone ?? recognizedCustomer?.customer.phone ?? "";
  const identityEmail = session?.customer_email ?? recognizedCustomer?.customer.email ?? "";
  const storeTimeZone = menu.store.timezone || "America/Sao_Paulo";
  const scheduledFor = session?.scheduled_for ?? null;
  const scheduledLocalValue = dateTimeLocalValue(scheduledFor, storeTimeZone);
  const changeForValue = session?.cash_change_for_cents ? (Number(session.cash_change_for_cents) / 100).toFixed(2).replace(".", ",") : "";
  const useRegisteredNeighborhoods = menu.delivery.fee_mode === "neighborhood" && deliveryNeighborhoods.length > 0;
  const selectedNeighborhoodId = deliveryNeighborhoods.find((item) => item.neighborhoodName === session?.address_district
    && item.city.toLocaleLowerCase("pt-BR") === (session?.address_city ?? "").toLocaleLowerCase("pt-BR")
    && item.state.toUpperCase() === (session?.address_state ?? "").toUpperCase())?.id ?? "";
  const subtotalCents = Number(cart.subtotal_cents);
  const minimumOrderCents = Number(menu.settings.minimum_order_cents ?? 0);
  const missingMinimumCents = Math.max(0, minimumOrderCents - subtotalCents);
  const minimumOrderBlocked = reviewAfterFailure?.review.blockers.some((blocker) => blocker.code === "minimum_order") ?? false;
  const reviewBlockerMessage = reviewAfterFailure?.review.blockers.map((blocker) => blocker.message).join(" ") ?? "";
  const displayErrorMessage = query.erro === "checkout_not_ready" && minimumOrderBlocked && missingMinimumCents > 0
    ? `Pedido mínimo não atingido. O mínimo da loja é ${money(minimumOrderCents)} em produtos. Seu carrinho possui ${money(subtotalCents)} em produtos. Adicione mais ${money(missingMinimumCents)} para continuar.`
    : query.erro === "checkout_not_ready" && reviewBlockerMessage
      ? reviewBlockerMessage
      : query.erro ? errorMessages[query.erro] ?? "Não foi possível continuar. Confira os dados e tente novamente." : null;

  // Expresso: uma tela só. Itens e cupom ficam acima (cada um com seu próprio envio);
  // recebimento, dados, endereço, pagamento e horário ficam num único formulário com um botão de confirmar.
  const recognizedAddresses = recognizedForSession && recognizedCustomer ? recognizedCustomer.addresses : [];
  const savedAddresses = recognizedAddresses.map((address, index) => ({
    index,
    label: address.isDefault ? "Endereço principal" : address.label,
    line: `${address.street}, ${address.number}${address.complement ? ` · ${address.complement}` : ""} · ${address.district} · ${address.city}/${address.state}`,
  }));
  const deliveryAllowed = Boolean(menu.settings.allow_delivery && menu.delivery.enabled);
  const paymentDefault = (query.erro === "pix_email_required" || query.erro === "invalid_payment_email") && enabledMethods.some((item) => item.method === "pix") ? "pix" : selectedPaymentValue;
  const couponDraft = query.erro === "benefit_invalid" ? cookieStore.get(`pedeaqui_coupon_draft_${slug}`)?.value ?? benefits?.current.couponCode ?? "" : benefits?.current.couponCode ?? "";
  const closedMessage = menu.operational.canOrder ? null : "A loja não está recebendo pedidos agora. Você pode montar o pedido e confirmar quando ela abrir.";

  return (
    <main className={styles.root}>
      <div className={`${styles.appShell} ${styles.expressShell}`}>
        <header className={styles.topbar}>
          <Link href={`/m/${slug}`} className={styles.back} aria-label="Voltar ao cardápio">← Cardápio</Link>
          <div className={styles.topTitle}><PedeAquiLogo size="xs" decorative /><span>Finalizar pedido</span></div>
          <span className={styles.stepCounter}>{menu.store.name}</span>
        </header>

        <div className={styles.stageViewport}>
          <StoreOrderStatus operational={menu.operational} />
          {query.erro ? <ScrollToActiveStage targetId="checkout-alerta" /> : null}
          {displayErrorMessage ? <div id="checkout-alerta" role="alert" aria-live="assertive" className={styles.alert}>{displayErrorMessage}</div> : null}

          <section className={`${styles.block} ${styles.reviewItems}`} aria-label="Itens do pedido">
            <div className={styles.itemsHeader}><h2>Seu pedido</h2><Link href={`/m/${slug}`}>+ Adicionar itens</Link></div>
            {cart.items.map((item) => <article key={item.id} className={styles.reviewItem}>
              <div className={styles.itemLine}>
                <div className={styles.itemStepper} role="group" aria-label={`Quantidade de ${item.product_name_snapshot}`}>
                  {Number(item.quantity) > 1
                    ? <form action={updateCartQuantityAction}><QuickFields slug={slug} itemId={item.id} /><input type="hidden" name="quantity" value={Number(item.quantity) - 1} /><button type="submit" aria-label={`Diminuir quantidade de ${item.product_name_snapshot}`}>−</button></form>
                    : <form action={removeCartItemAction}><QuickFields slug={slug} itemId={item.id} /><button type="submit" aria-label={`Remover ${item.product_name_snapshot}`}>−</button></form>}
                  <output aria-label={`${item.quantity} unidade(s)`}>{item.quantity}</output>
                  <form action={updateCartQuantityAction}><QuickFields slug={slug} itemId={item.id} /><input type="hidden" name="quantity" value={Math.min(99, Number(item.quantity) + 1)} /><button type="submit" disabled={Number(item.quantity) >= 99} aria-label={`Aumentar quantidade de ${item.product_name_snapshot}`}>+</button></form>
                </div>
                <strong className={styles.itemName}>{item.product_name_snapshot}</strong>
                <strong>{money(Number(item.line_total_cents))}</strong>
              </div>
              {item.modifiers.length > 0 ? <p>{item.modifiers.map((option) => `${Number(option.quantity ?? 1)}× ${option.modifier_name_snapshot}`).join(" · ")}</p> : null}
              {item.note ? <p>Observação: {item.note}</p> : null}
              {item.gas ? <p>{item.gas.sale_mode === "exchange" ? "Troca de vasilhame" : "Produto + vasilhame"}{item.gas.container_name_snapshot ? ` · ${item.gas.container_name_snapshot}` : ""}</p> : null}
            </article>)}
            {missingMinimumCents > 0 ? <p className={styles.minimumHint}>Faltam {money(missingMinimumCents)} para o pedido mínimo de {money(minimumOrderCents)}.</p> : null}
          </section>

          {growthEnabled && benefits ? (
            <details className={`${styles.block} ${styles.optional}`} open={totalDiscount > 0 || query.erro === "benefit_invalid" || query.erro === "benefit_unavailable"}>
              <summary>Tenho cupom{benefits.cashbackEnabled ? ", cashback" : ""}{benefits.loyaltyEnabled ? " ou pontos" : ""}{totalDiscount > 0 ? ` · economia ${money(totalDiscount)}` : ""}</summary>
              <div className={styles.optionalBody}>
                <form action={applyCheckoutBenefitsAction} className={styles.form}>
                  <input type="hidden" name="storeSlug" value={slug} />
                  <div className={styles.grid2}>
                    <Field label="Cupom" name="couponCode" defaultValue={couponDraft} placeholder="Ex.: VOLTA20" />
                    {benefits.cashbackEnabled ? <Field label={`Cashback${benefits.customerIdentified ? ` · saldo ${money(benefits.cashbackBalanceCents)}` : ""}`} name="cashbackAmount" inputMode="decimal" defaultValue={benefits.current.cashbackRedeemCents ? (benefits.current.cashbackRedeemCents / 100).toFixed(2).replace(".", ",") : ""} disabled={!benefits.customerIdentified} /> : null}
                    {benefits.loyaltyEnabled ? <Field label={`Pontos${benefits.customerIdentified ? ` · saldo ${benefits.loyaltyBalancePoints}` : ""}`} name="loyaltyPoints" type="number" min={0} defaultValue={benefits.current.loyaltyRedeemPoints || ""} disabled={!benefits.customerIdentified} /> : null}
                  </div>
                  {(benefits.cashbackEnabled || benefits.loyaltyEnabled) && !benefits.customerIdentified ? <p className={styles.optionalHint}>Confirme o pedido uma vez com seu WhatsApp para consultar seu saldo de benefícios.</p> : null}
                  <div className={styles.benefitActions}><button type="submit" className={styles.action}>Aplicar</button>{totalDiscount > 0 ? <button formAction={clearCheckoutBenefitsAction} type="submit" className={styles.secondary}>Remover</button> : null}</div>
                </form>
              </div>
            </details>
          ) : null}

          {recognizedCustomer && !recognizedForSession && deliverySelected ? <div className={styles.deliveryError}>Por segurança, confirme o endereço novamente para este WhatsApp.</div> : null}

          <ExpressCheckoutForm
            slug={slug}
            canOrder={menu.operational.canOrder}
            closedMessage={closedMessage}
            allowDelivery={deliveryAllowed}
            allowPickup={menu.settings.allow_pickup}
            deliveryEta={`${menu.delivery.estimated_min_minutes}–${menu.delivery.estimated_max_minutes} min`}
            useNeighborhoods={useRegisteredNeighborhoods}
            neighborhoods={deliveryNeighborhoods}
            storeCity={menu.store.city ?? ""}
            storeState={menu.store.state ?? ""}
            defaults={{
              fulfillment: session?.fulfillment_type === "delivery" || session?.fulfillment_type === "pickup" ? session.fulfillment_type : null,
              name: identityName,
              phone: identityPhone ?? "",
              email: identityEmail ?? "",
              neighborhoodId: selectedNeighborhoodId,
              postalCode: session?.address_postal_code ?? "",
              street: session?.address_street ?? "",
              number: session?.address_number ?? "",
              complement: session?.address_complement ?? "",
              district: session?.address_district ?? "",
              city: session?.address_city ?? "",
              state: session?.address_state ?? "",
              reference: session?.address_reference ?? "",
              paymentValue: paymentDefault,
              changeFor: changeForValue,
              scheduledLocal: scheduledLocalValue,
            }}
            savedAddresses={savedAddresses}
            paymentMethods={enabledMethods.map((item) => ({
              value: item.method === "custom" && item.customPaymentMethodId ? `custom:${item.customPaymentMethodId}` : item.method,
              method: item.method,
              label: item.method === "custom" ? item.label ?? paymentMethodLabels.custom : paymentMethodLabels[item.method],
              help: paymentMethodHelp[item.method],
            }))}
            totals={{
              subtotalCents,
              discountCents: totalDiscount,
              deliveryFeeCents: Number(cart.delivery_fee_cents ?? 0),
              totalCents: Number(cart.total_cents),
              quotedDelivery: deliverySelected && session?.delivery_quote_status === "valid",
            }}
            minimumMissingCents={missingMinimumCents}
          />
        </div>
      </div>
    </main>
  );
}

function QuickFields({ slug, itemId }: { slug: string; itemId: string }) {
  return <><input type="hidden" name="storeSlug" value={slug} /><input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="returnTo" value="checkout" /></>;
}

function Field({ label, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className={styles.field}><span>{label}</span><CheckoutInput {...input} label={label} className={styles.input} /></label>; }
