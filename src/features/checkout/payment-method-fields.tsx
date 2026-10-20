"use client";

import { Fragment, useState } from "react";
import { CashChangeFields } from "@/features/checkout/cash-change-fields";
import type { PaymentMethod } from "@/server/checkout/schemas";

type Method = {
  value: string;
  method: PaymentMethod;
  label: string;
  help: string;
  hostedCheckout?: boolean;
};

type Props = {
  methods: Method[];
  /** "delivery" ou "pickup": muda o título do grupo pago depois ("na entrega" / "na retirada"). */
  fulfillmentType?: string | null;
  /** E-mail já informado; o Pix pede o e-mail só quando é escolhido. */
  pixEmail?: string | null;
  defaultValue?: string | null;
  defaultChangeFor?: string;
  choicesClassName?: string;
  groupsClassName?: string;
  groupClassName?: string;
  choiceClassName?: string;
  selectedClassName?: string;
  paymentChoiceClassName?: string;
  detailClassName?: string;
  inputClassName?: string;
  fieldClassName?: string;
  cashChoicesClassName?: string;
  cashChoiceClassName?: string;
  cashSelectedClassName?: string;
  /** Ícone e texto de cada forma (layout do protótipo Expresso). */
  iconClassName?: string;
  textClassName?: string;
  /** Avisa a forma escolhida (o botão final vira "Confirmar e pagar com Pix"). */
  onSelect?: (value: string) => void;
};

function PaymentIcon({ method }: { method: PaymentMethod }) {
  const common = { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (method === "pix") return <svg {...common}><path d="m12 3 4.5 4.5L12 12 7.5 7.5zM12 12l4.5 4.5L12 21l-4.5-4.5zM3 12l4.5-4.5L12 12l-4.5 4.5zM21 12l-4.5 4.5L12 12l4.5-4.5z" /></svg>;
  if (method === "cash") return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9v.01M18 15v.01" /></svg>;
  if (method === "custom") return <svg {...common}><path d="M4 7h16v10H4z" /><path d="M8 11h8M8 14h5" /></svg>;
  return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></svg>;
}

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function PaymentMethodFields({
  methods,
  fulfillmentType = null,
  pixEmail = null,
  defaultValue = null,
  defaultChangeFor = "",
  choicesClassName,
  groupsClassName,
  groupClassName,
  choiceClassName,
  selectedClassName,
  paymentChoiceClassName,
  detailClassName,
  inputClassName,
  fieldClassName,
  cashChoicesClassName,
  cashChoiceClassName,
  cashSelectedClassName,
  iconClassName,
  textClassName,
  onSelect,
}: Props) {
  const [selection, setSelection] = useState<string | null>(defaultValue);
  const selected = methods.find((item) => item.value === selection) ?? null;

  const choose = (value: string) => { setSelection(value); onSelect?.(value); };

  // Layout Expresso: cada forma numa linha (ícone, nome e detalhe, marcador à direita).
  // O e-mail do Pix e o troco aparecem logo abaixo da forma escolhida.
  return (
    <div className={groupsClassName}>
      {[
        {label: "Pagar agora, pelo celular", methods: methods.filter((item) => item.method === "pix")},
        {label: fulfillmentType === "pickup" ? "Pagar na retirada" : "Pagar na entrega", methods: methods.filter((item) => item.method !== "pix")},
      ].filter((group) => group.methods.length > 0).map((group) => <fieldset key={group.label} className={groupClassName}>
        <legend>{group.label}</legend><div className={choicesClassName}>
          {group.methods.map((item) => (
            <Fragment key={item.value}>
              <label className={classes(choiceClassName, selection === item.value && selectedClassName)}>
                <span className={iconClassName}><PaymentIcon method={item.method} /></span>
                <span className={classes(paymentChoiceClassName, textClassName)}>
                  <strong>{item.label}</strong>
                  <span className={detailClassName}>{item.help}</span>
                </span>
                <input
                  type="radio"
                  name="paymentMethod"
                  value={item.value}
                  checked={selection === item.value}
                  onChange={() => choose(item.value)}
                  required
                />
              </label>
              {selection === item.value && selected?.method === "pix" ? (
                <label className={fieldClassName}>
                  <span>{selected.hostedCheckout ? "E-mail para o comprovante" : "E-mail para o comprovante do Pix"}</span>
                  <input className={inputClassName} type="email" name="email" autoComplete="email" inputMode="email" defaultValue={pixEmail ?? ""} required placeholder="voce@email.com" />
                </label>
              ) : null}
              {selection === item.value && selected?.method === "cash" ? (
                <CashChangeFields
                  defaultChangeFor={defaultChangeFor}
                  inputClassName={inputClassName}
                  fieldClassName={fieldClassName}
                  choicesClassName={cashChoicesClassName}
                  choiceClassName={cashChoiceClassName}
                  selectedClassName={cashSelectedClassName}
                />
              ) : null}
            </Fragment>
          ))}
        </div></fieldset>)}
    </div>
  );
}
