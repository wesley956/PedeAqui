"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckoutInput } from "@/features/checkout/checkout-input";
import {
  expressApplyBenefitsAction,
  expressClearBenefitsAction,
  expressItemAction,
  submitExpressCheckoutAction,
} from "@/features/checkout/express-actions";
import { NeighborhoodSelect } from "@/features/checkout/neighborhood-select";
import { PaymentMethodFields } from "@/features/checkout/payment-method-fields";
import { ProductImageFallback } from "@/features/menu/product-image-fallback";
import type { PaymentMethod } from "@/server/checkout/schemas";
import styles from "@/app/m/[slug]/checkout/checkout.module.css";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export type ExpressBlock = "itens" | "receber" | "dados" | "endereco" | "pagamento" | "quando" | "cupom" | "resumo";

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
  returningName: string | null;
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
  items: Array<{ id: string; productId: string; name: string; imageUrl: string | null; quantity: number; lineTotalCents: number; details: string; editable: boolean }>;
  savedAddresses: Array<{ index: number; label: string; line: string }>;
  paymentMethods: Array<{ value: string; method: PaymentMethod; label: string; help: string }>;
  benefits: null | {
    couponCode: string;
    cashbackEnabled: boolean;
    loyaltyEnabled: boolean;
    customerIdentified: boolean;
    cashbackBalanceCents: number;
    loyaltyBalancePoints: number;
    cashbackValue: string;
    loyaltyValue: string;
  };
  totals: { subtotalCents: number; discountCents: number; deliveryFeeCents: number; totalCents: number; quotedDelivery: boolean };
  minimumOrderCents: number;
  minimumMissingCents: number;
  error: { block: ExpressBlock; message: string } | null;
};

/**
 * Checkout Expresso (protótipo opção 3): uma tela só com itens, recebimento, dados, endereço,
 * pagamento, horário e cupom, tudo editável sem trocar de página, e um único botão de confirmar.
 * Trocar quantidade ou aplicar cupom guarda antes o que o cliente já preencheu.
 * O servidor só confirma se o total visto pelo cliente for o calculado.
 */
export function ExpressCheckoutForm(props: ExpressCheckoutProps) {
  const { defaults, totals, error } = props;
  const initialMode = defaults.fulfillment ?? (props.allowDelivery ? "delivery" : "pickup");
  const [mode, setMode] = useState<"delivery" | "pickup">(initialMode);
  const [savedChoice, setSavedChoice] = useState<string>(props.savedAddresses.length > 0 && !defaults.street ? String(props.savedAddresses[0]?.index ?? "new") : "new");
  const [when, setWhen] = useState<"asap" | "scheduled">(defaults.scheduledLocal ? "scheduled" : "asap");
  const [payment, setPayment] = useState<string | null>(defaults.paymentValue);
  const errorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!error) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    errorRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [error]);

  // O total confirmado é o que o servidor já calculou. Se a entrega ainda não foi calculada para este endereço,
  // o primeiro toque em Confirmar calcula e mostra o total final antes de enviar o pedido.
  const sameAsQuoted = mode === "pickup" ? defaults.fulfillment === "pickup" : totals.quotedDelivery;
  const knownTotal = sameAsQuoted ? totals.totalCents : null;
  const deliveryLabel = mode === "pickup" ? "Retirada" : totals.quotedDelivery ? (totals.deliveryFeeCents > 0 ? money(totals.deliveryFeeCents) : "Grátis") : "informe o endereço";
  const shownTotal = knownTotal ?? totals.subtotalCents - totals.discountCents;
  const itemCount = props.items.reduce((sum, item) => sum + item.quantity, 0);
  const pixSelected = payment === "pix";
  const confirmLabel = pixSelected ? "Confirmar e pagar com Pix" : "Confirmar pedido";
  // Nome acessível com o valor, ex.: "Confirmar pedido · R$ 45,00".
  const confirmName = knownTotal === null ? confirmLabel : pixSelected ? `Confirmar e pagar com Pix · ${money(knownTotal)}` : `Confirmar pedido · ${money(knownTotal)}`;

  const block = (id: ExpressBlock, title: ReactNode, body: ReactNode, extra?: ReactNode) => {
    const failed = error?.block === id;
    return (
      <section
        id={`bloco-${id}`}
        ref={failed ? (node) => { errorRef.current = node; } : undefined}
        className={`${styles.block} ${failed ? styles.blockError : ""}`}
        aria-labelledby={`titulo-${id}`}
      >
        <h2 id={`titulo-${id}`} className={styles.blockTitle}>{title}{extra}</h2>
        {body}
        {failed && error ? <p className={styles.errorText} role="alert">{error.message}</p> : null}
      </section>
    );
  };

  return (
    <form id="checkout-expresso" action={submitExpressCheckoutAction} className={styles.expressForm}>
      <input type="hidden" name="storeSlug" value={props.slug} />
      <input type="hidden" name="fulfillmentType" value={mode} />
      <input type="hidden" name="when" value={when} />
      <input type="hidden" name="expectedTotalCents" value={knownTotal ?? ""} />

      {block("itens", `Itens · ${itemCount}`, <>
        <div className={styles.lines}>
          {props.items.map((item) => (
            <div key={item.id} className={styles.line}>
              {item.imageUrl
                // Fotos do catálogo já vêm no tamanho certo; <img> simples aceita URLs antigas.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={item.imageUrl} alt="" width={56} height={56} loading="lazy" className={styles.lineImage} />
                : <ProductImageFallback className={styles.lineImage} />}
              <div className={styles.lineInfo}>
                <strong className={styles.lineName}>{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</strong>
                {item.details ? <p className={styles.lineDetails}>{item.details}</p> : null}
                <div className={styles.lineActions}>
                  <div className={styles.stepper} role="group" aria-label={`Quantidade de ${item.name}`}>
                    <ItemButton value={item.quantity > 1 ? `set:${item.id}:${item.quantity - 1}` : `remove:${item.id}`} label={item.quantity > 1 ? `Diminuir ${item.name}` : `Remover ${item.name}`}>
                      {item.quantity > 1 ? <MinusIcon /> : <TrashIcon />}
                    </ItemButton>
                    <output aria-label={`${item.quantity} unidade(s)`}>{item.quantity}</output>
                    <ItemButton value={`set:${item.id}:${Math.min(99, item.quantity + 1)}`} label={`Aumentar ${item.name}`} disabled={item.quantity >= 99}><PlusIcon /></ItemButton>
                  </div>
                  {item.editable ? <Link href={`/m/${props.slug}/produto/${item.productId}?editar=${item.id}&voltar=checkout`} scroll={false} className={styles.textLink}>Editar</Link> : null}
                </div>
              </div>
              <strong className={styles.linePrice}>{money(item.lineTotalCents)}</strong>
            </div>
          ))}
        </div>
        {props.minimumMissingCents > 0 ? (
          <div className={styles.progress}>
            Faltam <strong>{money(props.minimumMissingCents)}</strong> para o pedido mínimo de {money(props.minimumOrderCents)}
            <div className={styles.progressBar}><span style={{ width: `${Math.min(100, (totals.subtotalCents / Math.max(1, props.minimumOrderCents)) * 100)}%` }} /></div>
          </div>
        ) : null}
        <Link href={`/m/${props.slug}`} className={styles.textLink}>+ Adicionar mais itens</Link>
      </>)}

      {block("receber", "Como receber", (
        <div className={styles.seg} role="group" aria-label="Como receber">
          {props.allowDelivery ? <button type="button" aria-pressed={mode === "delivery"} onClick={() => setMode("delivery")}><strong>Entrega</strong><span>{props.deliveryEta}</span></button> : null}
          {props.allowPickup ? <button type="button" aria-pressed={mode === "pickup"} onClick={() => setMode("pickup")}><strong>Retirada</strong><span>Sem taxa de entrega</span></button> : null}
        </div>
      ))}

      {block("dados", "Seus dados", <>
        {props.returningName ? <p className={styles.okBox}>Que bom te ver de novo, {props.returningName}!{props.savedAddresses.length > 0 ? " Seu endereço salvo já está aqui." : ""}</p> : null}
        <Field label="WhatsApp" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={defaults.phone} placeholder="(19) 99999-9999" help="Para avisar sobre o pedido." required />
        <Field label="Nome" name="name" autoComplete="name" defaultValue={defaults.name} placeholder="Como podemos te chamar?" required />
      </>)}

      {mode === "delivery" ? block("endereco", "Endereço", <>
        {props.savedAddresses.length > 0 ? (
          <div className={styles.savedList} role="radiogroup" aria-label="Endereços salvos">
            {props.savedAddresses.map((address) => (
              <label key={address.index} className={`${styles.payOption} ${savedChoice === String(address.index) ? styles.payOptionSelected : ""}`}>
                <span className={styles.payIcon}><PinIcon /></span>
                <span className={styles.payText}><strong>{address.label}</strong><span>{address.line}</span></span>
                <input type="radio" name="savedAddressIndex" value={address.index} checked={savedChoice === String(address.index)} onChange={() => setSavedChoice(String(address.index))} />
              </label>
            ))}
            <label className={`${styles.payOption} ${savedChoice === "new" ? styles.payOptionSelected : ""}`}>
              <span className={styles.payIcon}><PlusIcon /></span>
              <span className={styles.payText}><strong>Outro endereço</strong></span>
              <input type="radio" name="savedAddressIndex" value="new" checked={savedChoice === "new"} onChange={() => setSavedChoice("new")} />
            </label>
          </div>
        ) : null}
        {props.savedAddresses.length === 0 || savedChoice === "new" ? <>
          {props.useNeighborhoods
            ? <NeighborhoodSelect neighborhoods={props.neighborhoods} defaultNeighborhoodId={defaults.neighborhoodId} inputClassName={styles.input} fieldClassName={styles.field} choicesClassName={styles.choices} choiceClassName={styles.choice} selectedClassName={styles.choiceSelected} detailClassName={styles.choiceDetail} secondaryButtonClassName={styles.neighborhoodChange} />
            : null}
          <div className={styles.two}>
            <Field label="CEP (opcional)" name="postalCode" inputMode="numeric" autoComplete="postal-code" defaultValue={defaults.postalCode} placeholder="00000-000" />
            <Field label="Número" name="number" inputMode="numeric" defaultValue={defaults.number} placeholder="123" required />
          </div>
          <Field label="Rua" name="street" autoComplete="street-address" defaultValue={defaults.street} required />
          {!props.useNeighborhoods ? <>
            <Field label="Bairro" name="district" autoComplete="address-level3" defaultValue={defaults.district} required />
            <div className={styles.cityRow}><Field label="Cidade" name="city" autoComplete="address-level2" defaultValue={defaults.city || props.storeCity} required /><Field label="UF" name="state" autoComplete="address-level1" defaultValue={defaults.state || props.storeState} maxLength={2} required /></div>
          </> : null}
          <Field label="Complemento e referência" name="complement" defaultValue={[defaults.complement, defaults.reference].filter(Boolean).join(" · ")} placeholder="Apto, bloco, portão azul…" />
          <input type="hidden" name="reference" value="" />
        </> : null}
        {totals.quotedDelivery ? <p className={styles.okBox}><strong>Entregamos aí</strong> · taxa {totals.deliveryFeeCents > 0 ? money(totals.deliveryFeeCents) : "grátis"} · {props.deliveryEta}</p> : null}
      </>) : null}

      {block("pagamento", "Pagamento", props.paymentMethods.length === 0
        ? <p className={styles.errorText}>Este estabelecimento não tem uma forma de pagamento disponível no momento.</p>
        : (
          <PaymentMethodFields
            methods={props.paymentMethods}
            defaultValue={defaults.paymentValue}
            defaultChangeFor={defaults.changeFor}
            fulfillmentType={mode}
            pixEmail={defaults.email}
            onSelect={setPayment}
            groupsClassName={styles.payGroups}
            groupClassName={styles.payGroup}
            choicesClassName={styles.payChoices}
            choiceClassName={styles.payOption}
            selectedClassName={styles.payOptionSelected}
            iconClassName={styles.payIcon}
            textClassName={styles.payText}
            detailClassName={styles.payDetail}
            inputClassName={styles.input}
            fieldClassName={styles.field}
            cashChoicesClassName={styles.segLabels}
            cashChoiceClassName={styles.segLabel}
            cashSelectedClassName={styles.segLabelSelected}
          />
        ))}

      {block("quando", "Quando", <>
        <div className={styles.seg} role="group" aria-label="Quando">
          <button type="button" aria-pressed={when === "asap"} onClick={() => setWhen("asap")}><strong>Agora</strong><span>{mode === "delivery" ? props.deliveryEta : "Assim que ficar pronto"}</span></button>
          <button type="button" aria-pressed={when === "scheduled"} onClick={() => setWhen("scheduled")}><strong>Agendar</strong><span>Escolha dia e hora</span></button>
        </div>
        {when === "scheduled" ? <Field label="Data e hora" name="localDateTime" type="datetime-local" defaultValue={defaults.scheduledLocal} required /> : null}
      </>)}

      {props.benefits ? block("cupom", "Cupom", <>
        <div className={styles.couponRow}>
          <label className={styles.couponField}><span className={styles.srOnly}>Cupom</span><input className={styles.input} name="couponCode" defaultValue={props.benefits.couponCode} placeholder="Tem cupom? Ex.: VOLTA20" autoCapitalize="characters" /></label>
          <ActionButton action={expressApplyBenefitsAction} className={styles.ghostButton}>Aplicar</ActionButton>
        </div>
        {props.benefits.cashbackEnabled || props.benefits.loyaltyEnabled ? (
          <div className={styles.grid2}>
            {props.benefits.cashbackEnabled ? <Field label={`Cashback${props.benefits.customerIdentified ? ` · saldo ${money(props.benefits.cashbackBalanceCents)}` : ""}`} name="cashbackAmount" inputMode="decimal" defaultValue={props.benefits.cashbackValue} disabled={!props.benefits.customerIdentified} /> : null}
            {props.benefits.loyaltyEnabled ? <Field label={`Pontos${props.benefits.customerIdentified ? ` · saldo ${props.benefits.loyaltyBalancePoints}` : ""}`} name="loyaltyPoints" type="number" min={0} defaultValue={props.benefits.loyaltyValue} disabled={!props.benefits.customerIdentified} /> : null}
          </div>
        ) : null}
        {totals.discountCents > 0 ? <p className={styles.okBox}>Você economizou <strong>{money(totals.discountCents)}</strong> <ActionButton action={expressClearBenefitsAction} className={styles.textLink}>Remover</ActionButton></p> : null}
      </>) : null}

      <section id="bloco-resumo" ref={error?.block === "resumo" ? (node) => { errorRef.current = node; } : undefined} className={`${styles.block} ${error?.block === "resumo" ? styles.blockNotice : ""}`} aria-labelledby="titulo-resumo">
        <h2 id="titulo-resumo" className={styles.srOnly}>Resumo</h2>
        {error?.block === "resumo" ? <p className={styles.infoBox} role="status">{error.message}</p> : null}
        <div className={styles.totals}>
          <div><span>Subtotal</span><span>{money(totals.subtotalCents)}</span></div>
          <div><span>Entrega</span><span>{deliveryLabel}</span></div>
          {totals.discountCents > 0 ? <div className={styles.discount}><span>Desconto</span><span>− {money(totals.discountCents)}</span></div> : null}
          <div className={styles.totalLine}><span>Total</span><span>{money(shownTotal)}</span></div>
        </div>
        {knownTotal === null && mode === "delivery" ? <p className={styles.optionalHint}>Ao tocar em Confirmar, calculamos a entrega e mostramos o total final antes de enviar.</p> : null}
      </section>

      <footer className={styles.expressFooter}>
        {props.minimumMissingCents > 0
          ? <p className={styles.footHint}>Faltam {money(props.minimumMissingCents)} para o pedido mínimo.</p>
          : !props.canOrder ? <p className={styles.footHint}>{props.closedMessage ?? "A loja não está recebendo pedidos agora."}</p> : null}
        <ConfirmButton
          label={confirmLabel}
          accessibleName={confirmName}
          total={knownTotal !== null ? money(knownTotal) : null}
          disabled={props.minimumMissingCents > 0 || !props.canOrder}
        />
      </footer>
    </form>
  );
}

function ConfirmButton({ label, accessibleName, total, disabled }: { label: string; accessibleName: string; total: string | null; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.confirmButton} disabled={disabled || pending} aria-busy={pending || undefined} aria-label={pending ? "Enviando pedido…" : accessibleName}>
      <span>{pending ? "Enviando pedido…" : label}</span>
      {total ? <span>{total}</span> : null}
    </button>
  );
}

function ItemButton({ value, label, disabled, children }: { value: string; label: string; disabled?: boolean; children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" name="itemAction" value={value} formAction={expressItemAction} formNoValidate aria-label={label} disabled={disabled || pending}>{children}</button>;
}

function ActionButton({ action, className, children }: { action: (formData: FormData) => Promise<void>; className?: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" formAction={action} formNoValidate className={className} disabled={pending}>{children}</button>;
}

function Field({ label, help, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string }) {
  return <label className={styles.field}><span>{label}</span><CheckoutInput {...input} label={label} className={styles.input} />{help ? <small className={styles.help}>{help}</small> : null}</label>;
}

function PlusIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>; }
function MinusIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>; }
function PinIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>; }
