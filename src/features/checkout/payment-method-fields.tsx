"use client";

import { useState } from "react";
import { CashChangeFields } from "@/features/checkout/cash-change-fields";
import type { PaymentMethod } from "@/server/checkout/schemas";

type Method = {
  value: string;
  method: PaymentMethod;
  label: string;
  help: string;
};

type Props = {
  methods: Method[];
  defaultValue?: string | null;
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
  defaultValue = null,
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
  const [selection, setSelection] = useState<string | null>(defaultValue);
  const selected = methods.find((item) => item.value === selection) ?? null;

  return (
    <>
      <div className={choicesClassName}>
        {methods.map((item) => (
          <label key={item.value} className={classes(choiceClassName, selection === item.value && selectedClassName)}>
            <span className={paymentChoiceClassName}>
              <input
                type="radio"
                name="paymentMethod"
                value={item.value}
                checked={selection === item.value}
                onChange={() => setSelection(item.value)}
                required
              />
              <strong>{item.label}</strong>
            </span>
            <span className={detailClassName}>{item.help}</span>
          </label>
        ))}
      </div>

      {selected?.method === "cash" ? (
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
