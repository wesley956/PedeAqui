"use client";

import { useState } from "react";
import { CashChangeFields } from "@/features/checkout/cash-change-fields";

type Method = {
  method: "cash" | "pix" | "credit_card" | "debit_card";
  label: string;
  help: string;
};

type Props = {
  methods: Method[];
  defaultMethod?: Method["method"] | null;
  defaultChangeFor?: string;
  choicesClassName?: string;
  choiceClassName?: string;
  selectedClassName?: string;
  paymentChoiceClassName?: string;
  detailClassName?: string;
  inputClassName?: string;
  fieldClassName?: string;
  cashChoicesClassName?: string;
  cashChoiceClassName?: string;
  cashSelectedClassName?: string;
};

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function PaymentMethodFields({
  methods,
  defaultMethod = null,
  defaultChangeFor = "",
  choicesClassName,
  choiceClassName,
  selectedClassName,
  paymentChoiceClassName,
  detailClassName,
  inputClassName,
  fieldClassName,
  cashChoicesClassName,
  cashChoiceClassName,
  cashSelectedClassName,
}: Props) {
  const [method, setMethod] = useState<Method["method"] | null>(defaultMethod);

  return (
    <>
      <div className={choicesClassName}>
        {methods.map((item) => (
          <label key={item.method} className={classes(choiceClassName, method === item.method && selectedClassName)}>
            <span className={paymentChoiceClassName}>
              <input
                type="radio"
                name="paymentMethod"
                value={item.method}
                checked={method === item.method}
                onChange={() => setMethod(item.method)}
                required
              />
              <strong>{item.label}</strong>
            </span>
            <span className={detailClassName}>{item.help}</span>
          </label>
        ))}
      </div>

      {method === "cash" ? (
        <CashChangeFields
          defaultChangeFor={defaultChangeFor}
          inputClassName={inputClassName}
          fieldClassName={fieldClassName}
          choicesClassName={cashChoicesClassName}
          choiceClassName={cashChoiceClassName}
          selectedClassName={cashSelectedClassName}
        />
      ) : null}
    </>
  );
}
