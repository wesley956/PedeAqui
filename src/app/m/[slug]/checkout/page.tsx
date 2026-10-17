import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ExpressCheckoutForm, type ExpressBlock } from "@/features/checkout/express-checkout-form";
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
  scheduling_disabled: "Esta loja recebe somente pedidos para agora. Confira os dados e confirme novamente.",
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

  // Expresso (protótipo opção 3): itens, recebimento, dados, endereço, pagamento, horário e cupom
  // numa tela só, num único formulário, com um botão de confirmar.
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

  // Erros que pertencem a um bloco aparecem dentro dele (como no protótipo); os demais, no topo.
  const errorBlock: Partial<Record<string, ExpressBlock>> = {
    invalid_fulfillment: "receber", pickup_disabled: "receber", delivery_disabled: "receber",
    invalid_phone: "dados", invalid_identity: "dados",
    invalid_address: "endereco", delivery_not_selected: "endereco", delivery_minimum: "endereco", neighborhood_not_served: "endereco",
    saved_address_invalid: "endereco", recognition_required: "endereco", identity_required: "endereco",
    invalid_payment: "pagamento", payment_unavailable: "pagamento", invalid_change: "pagamento", pix_email_required: "pagamento", invalid_payment_email: "pagamento",
    invalid_schedule: "quando", benefit_invalid: "cupom", benefit_unavailable: "cupom", total_updated: "resumo",
  };
  const blockForError = query.erro ? errorBlock[query.erro] ?? null : null;
  const formError = blockForError && displayErrorMessage ? { block: blockForError, message: displayErrorMessage } : null;
  const topError = formError ? null : displayErrorMessage;
  const returningName = recognizedCustomer?.customer.name ? recognizedCustomer.customer.name.trim().split(/\s+/)[0] ?? null : null;

  return (
    <main className={styles.root}>
      <div className={`${styles.appShell} ${styles.expressShell}`}>
        <header className={styles.topbar}>
          <Link href={`/m/${slug}`} className={styles.iconButton} aria-label="Voltar ao cardápio">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <h1 className={styles.topHeading}>Seu pedido</h1>
        </header>

        <div className={styles.stageViewport}>
          <StoreOrderStatus operational={menu.operational} />
          {topError ? <ScrollToActiveStage targetId="checkout-alerta" /> : null}
          {topError ? <div id="checkout-alerta" role="alert" aria-live="assertive" className={styles.alert}>{topError}</div> : null}
          {recognizedCustomer && !recognizedForSession && deliverySelected ? <div className={styles.deliveryError}>Por segurança, confirme o endereço novamente para este WhatsApp.</div> : null}

          <ExpressCheckoutForm
            slug={slug}
            canOrder={menu.operational.canOrder}
            closedMessage={closedMessage}
            allowDelivery={deliveryAllowed}
            allowPickup={menu.settings.allow_pickup}
            allowScheduling={data.allowScheduling}
            deliveryEta={`${menu.delivery.estimated_min_minutes}–${menu.delivery.estimated_max_minutes} min`}
            useNeighborhoods={useRegisteredNeighborhoods}
            neighborhoods={deliveryNeighborhoods}
            storeCity={menu.store.city ?? ""}
            storeState={menu.store.state ?? ""}
            returningName={returningName}
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
            items={cart.items.map((item) => ({
              id: item.id,
              productId: item.product_id,
              name: item.product_name_snapshot,
              imageUrl: item.product_image_url_snapshot || null,
              quantity: Number(item.quantity),
              lineTotalCents: Number(item.line_total_cents),
              details: [
                item.modifiers.map((option) => `${Number(option.quantity ?? 1) > 1 ? `${Number(option.quantity)}× ` : ""}${option.modifier_name_snapshot}`).join(" · "),
                item.gas ? `${item.gas.sale_mode === "exchange" ? "Troca de vasilhame" : "Produto + vasilhame"}${item.gas.container_name_snapshot ? ` · ${item.gas.container_name_snapshot}` : ""}` : "",
                item.note ? `Obs.: ${item.note}` : "",
              ].filter(Boolean).join(" · "),
              editable: item.modifiers.length > 0 || Boolean(item.gas) || Boolean(item.note),
            }))}
            savedAddresses={savedAddresses}
            paymentMethods={enabledMethods.map((item) => ({
              value: item.method === "custom" && item.customPaymentMethodId ? `custom:${item.customPaymentMethodId}` : item.method,
              method: item.method,
              label: item.method === "custom" ? item.label ?? paymentMethodLabels.custom : paymentMethodLabels[item.method],
              help: paymentMethodHelp[item.method],
            }))}
            benefits={growthEnabled && benefits ? {
              couponCode: couponDraft,
              cashbackEnabled: benefits.cashbackEnabled,
              loyaltyEnabled: benefits.loyaltyEnabled,
              customerIdentified: benefits.customerIdentified,
              cashbackBalanceCents: benefits.cashbackBalanceCents,
              loyaltyBalancePoints: benefits.loyaltyBalancePoints,
              cashbackValue: benefits.current.cashbackRedeemCents ? (benefits.current.cashbackRedeemCents / 100).toFixed(2).replace(".", ",") : "",
              loyaltyValue: benefits.current.loyaltyRedeemPoints ? String(benefits.current.loyaltyRedeemPoints) : "",
            } : null}
            totals={{
              subtotalCents,
              discountCents: totalDiscount,
              deliveryFeeCents: Number(cart.delivery_fee_cents ?? 0),
              totalCents: Number(cart.total_cents),
              quotedDelivery: deliverySelected && session?.delivery_quote_status === "valid",
            }}
            minimumOrderCents={minimumOrderCents}
            minimumMissingCents={missingMinimumCents}
            error={formError}
          />
        </div>
      </div>
    </main>
  );
}
