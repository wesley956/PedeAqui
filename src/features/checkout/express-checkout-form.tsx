"use client";

import { useState, type InputHTMLAttributes } from "react";
import { CheckoutInput } from "@/features/checkout/checkout-input";
import { submitExpressCheckoutAction } from "@/features/checkout/express-actions";
import { NeighborhoodSelect } from "@/features/checkout/neighborhood-select";
import { PaymentMethodFields } from "@/features/checkout/payment-method-fields";
import { SubmitOrderButton } from "@/features/checkout/submit-order-button";
import type { PaymentMethod } from "@/server/checkout/schemas";
import styles from "@/app/m/[slug]/checkout/checkout.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export type ExpressCheckoutProps = {
  slug: string;
  canOrder: boolean;
  closedMessage: string | null;
  allowDelivery: boolean;
  allowPickup: boolean;
  deliveryEta: string;
  useNeighborhoods: boolean;
  neighborhoods: Array<{ id: string; neighborhoodName: string; city: string; state: string; feeCents: number; minimumOrderCents: number | null }>;
  storeCity: string;
  storeState: string;
  defaults: {
    fulfillment: "delivery" | "pickup" | null;
    name: string;
    phone: string;
    email: string;
    neighborhoodId: string;
    postalCode: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    reference: string;
    paymentValue: string | null;
    changeFor: string;
    scheduledLocal: string;
  };
  savedAddresses: Array<{ index: number; label: string; line: string }>;
  paymentMethods: Array<{ value: string; method: PaymentMethod; label: string; help: string }>;
  totals: { subtotalCents: number; discountCents: number; deliveryFeeCents: number; totalCents: number; quotedDelivery: boolean };
  minimumMissingCents: number;
};

/**
 * Checkout Expresso: todos os dados numa tela, editáveis sem recarregar, e um único botão de confirmar.
 * O servidor salva cada parte com as mesmas validações e só confirma se o total visto pelo cliente
 * for o mesmo calculado (a taxa de entrega aparece antes de confirmar).
 */
export function ExpressCheckoutForm(props: ExpressCheckoutProps) {
  const { defaults, totals } = props;
  const initialMode = defaults.fulfillment ?? (props.allowDelivery ? "delivery" : "pickup");
  const [mode, setMode] = useState<"delivery" | "pickup">(initialMode);
  const [savedChoice, setSavedChoice] = useState<string>(props.savedAddresses.length > 0 && !defaults.street ? String(props.savedAddresses[0]?.index ?? "new") : "new");
  const [when, setWhen] = useState<"asap" | "scheduled">(defaults.scheduledLocal ? "scheduled" : "asap");

  // O total confirmado é o que o servidor já calculou. Se a entrega ainda não foi calculada para este endereço,
  // o primeiro toque em Confirmar calcula e mostra o total final antes de enviar o pedido.
  const sameAsQuoted = mode === "pickup" ? defaults.fulfillment === "pickup" : totals.quotedDelivery;
  const knownTotal = sameAsQuoted ? totals.totalCents : null;
  const deliveryLabel = mode === "pickup" ? "Retirada" : totals.quotedDelivery ? (totals.deliveryFeeCents > 0 ? money(totals.deliveryFeeCents) : "Grátis") : "calculada ao confirmar";
  const totalLabel = knownTotal !== null ? money(knownTotal) : money(totals.subtotalCents - totals.discountCents);

  return (
    <form id="checkout-expresso" action={submitExpressCheckoutAction} className={styles.expressForm}>
      <input type="hidden" name="storeSlug" value={props.slug} />
      <input type="hidden" name="fulfillmentType" value={mode} />
      <input type="hidden" name="when" value={when} />
      <input type="hidden" name="expectedTotalCents" value={knownTotal ?? ""} />

      <section className={styles.block} aria-labelledby="bloco-receber">
        <h2 id="bloco-receber">Como receber</h2>
        <div className={styles.segmented} role="group" aria-label="Como receber">
          {props.allowDelivery ? <button type="button" aria-pressed={mode === "delivery"} onClick={() => setMode("delivery")}><strong>Entrega</strong><span>{props.deliveryEta}</span></button> : null}
          {props.allowPickup ? <button type="button" aria-pressed={mode === "pickup"} onClick={() => setMode("pickup")}><strong>Retirada</strong><span>Sem taxa de entrega</span></button> : null}
        </div>
      </section>

      <section className={styles.block} aria-labelledby="bloco-dados">
        <h2 id="bloco-dados">Seus dados</h2>
        <Field label="WhatsApp" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={defaults.phone} placeholder="(19) 99999-9999" required />
        <Field label="Nome" name="name" autoComplete="name" defaultValue={defaults.name} required />
      </section>

      {mode === "delivery" ? (
        <section className={styles.block} aria-labelledby="bloco-endereco">
          <h2 id="bloco-endereco">Endereço</h2>
          {props.savedAddresses.length > 0 ? (
            <div className={styles.savedList} role="radiogroup" aria-label="Endereços salvos">
              {props.savedAddresses.map((address) => (
                <label key={address.index} className={`${styles.choice} ${savedChoice === String(address.index) ? styles.choiceSelected : ""}`}>
                  <span className={styles.paymentChoice}><input type="radio" name="savedAddressIndex" value={address.index} checked={savedChoice === String(address.index)} onChange={() => setSavedChoice(String(address.index))} /><strong>{address.label}</strong></span>
                  <span className={styles.choiceDetail}>{address.line}</span>
                </label>
              ))}
              <label className={`${styles.choice} ${savedChoice === "new" ? styles.choiceSelected : ""}`}>
                <span className={styles.paymentChoice}><input type="radio" name="savedAddressIndex" value="new" checked={savedChoice === "new"} onChange={() => setSavedChoice("new")} /><strong>Outro endereço</strong></span>
              </label>
            </div>
          ) : null}
          {props.savedAddresses.length === 0 || savedChoice === "new" ? (
            <div className={styles.form}>
              {props.useNeighborhoods
                ? <NeighborhoodSelect neighborhoods={props.neighborhoods} defaultNeighborhoodId={defaults.neighborhoodId} inputClassName={styles.input} fieldClassName={styles.field} choicesClassName={styles.choices} choiceClassName={styles.choice} selectedClassName={styles.choiceSelected} detailClassName={styles.choiceDetail} secondaryButtonClassName={styles.neighborhoodChange} />
                : <div className={styles.grid2}><Field label="Bairro" name="district" autoComplete="address-level3" defaultValue={defaults.district} required /><Field label="Cidade" name="city" autoComplete="address-level2" defaultValue={defaults.city || props.storeCity} required /><Field label="UF" name="state" autoComplete="address-level1" defaultValue={defaults.state || props.storeState} maxLength={2} required /></div>}
              <div className={styles.addressRow}><Field label="Rua" name="street" autoComplete="street-address" defaultValue={defaults.street} required /><Field label="Número" name="number" defaultValue={defaults.number} required /></div>
              <div className={styles.grid2}><Field label="Complemento (opcional)" name="complement" defaultValue={defaults.complement} placeholder="Apto, bloco…" /><Field label="Referência (opcional)" name="reference" defaultValue={defaults.reference} placeholder="Ex.: portão preto" /></div>
              <Field label="CEP (opcional)" name="postalCode" inputMode="numeric" autoComplete="postal-code" defaultValue={defaults.postalCode} />
            </div>
          ) : null}
          {totals.quotedDelivery ? <p className={styles.deliveryOk}><strong>Entregamos aí</strong><span>Taxa {totals.deliveryFeeCents > 0 ? money(totals.deliveryFeeCents) : "grátis"}</span></p> : null}
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="bloco-pagamento">
        <h2 id="bloco-pagamento">Pagamento</h2>
        {props.paymentMethods.length === 0 ? <p className={styles.deliveryError}>Este estabelecimento não tem uma forma de pagamento disponível no momento.</p> : (
          <PaymentMethodFields
            methods={props.paymentMethods}
            defaultValue={defaults.paymentValue}
            defaultChangeFor={defaults.changeFor}
            fulfillmentType={mode}
            pixEmail={defaults.email}
            groupsClassName={styles.paymentGroups}
            groupClassName={styles.paymentGroup}
            choicesClassName={styles.choices}
            choiceClassName={styles.choice}
            selectedClassName={styles.choiceSelected}
            paymentChoiceClassName={styles.paymentChoice}
            detailClassName={styles.choiceDetail}
            inputClassName={styles.input}
            fieldClassName={styles.field}
            cashChoicesClassName={styles.cashChoices}
            cashChoiceClassName={styles.cashChoice}
            cashSelectedClassName={styles.cashChoiceSelected}
          />
        )}
      </section>

      <section className={styles.block} aria-labelledby="bloco-quando">
        <h2 id="bloco-quando">Quando</h2>
        <div className={styles.segmented} role="group" aria-label="Quando">
          <button type="button" aria-pressed={when === "asap"} onClick={() => setWhen("asap")}><strong>Agora</strong><span>{mode === "delivery" ? props.deliveryEta : "Assim que ficar pronto"}</span></button>
          <button type="button" aria-pressed={when === "scheduled"} onClick={() => setWhen("scheduled")}><strong>Agendar</strong><span>Escolha dia e hora</span></button>
        </div>
        {when === "scheduled" ? <Field label="Data e hora" name="localDateTime" type="datetime-local" defaultValue={defaults.scheduledLocal} required /> : null}
      </section>

      <section className={styles.block} aria-labelledby="bloco-resumo" id="resumo">
        <h2 id="bloco-resumo">Resumo</h2>
        <div className={styles.summaryRows}>
          <div className={styles.summaryLine}><span>Subtotal</span><strong>{money(totals.subtotalCents)}</strong></div>
          {totals.discountCents > 0 ? <div className={styles.summaryLine}><span>Descontos</span><strong>− {money(totals.discountCents)}</strong></div> : null}
          <div className={styles.summaryLine}><span>Entrega</span><strong>{deliveryLabel}</strong></div>
          <div className={styles.divider} />
          <div className={`${styles.summaryLine} ${styles.total}`}><span>Total</span><strong>{totalLabel}</strong></div>
        </div>
        {knownTotal === null && mode === "delivery" ? <p className={styles.optionalHint}>Ao tocar em Confirmar, calculamos a entrega e mostramos o total final antes de enviar.</p> : null}
      </section>

      <p className={styles.serverReviewNote}>Seu pedido será enviado à loja ao confirmar. Você acompanha tudo pelo WhatsApp.</p>

      <footer className={styles.expressFooter}>
        {props.minimumMissingCents > 0
          ? <p className={styles.minimumHint}>Faltam {money(props.minimumMissingCents)} para o pedido mínimo.</p>
          : !props.canOrder ? <p className={styles.minimumHint}>{props.closedMessage ?? "A loja não está recebendo pedidos agora."}</p>
          : <SubmitOrderButton className={styles.finalAction} label={knownTotal !== null ? `Confirmar pedido · ${money(knownTotal)}` : "Confirmar pedido"} />}
      </footer>
    </form>
  );
}

function Field({ label, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={styles.field}><span>{label}</span><CheckoutInput {...input} label={label} className={styles.input} /></label>;
}
