"use client";

import type { InputHTMLAttributes } from "react";

export function CheckoutInput({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <input {...props} onInvalid={(event) => {
    const input = event.currentTarget;
    input.setCustomValidity("");
    if (input.validity.valueMissing) input.setCustomValidity(`Preencha ${label.toLocaleLowerCase("pt-BR")}.`);
    else if (input.validity.typeMismatch) input.setCustomValidity(`Informe um ${label.toLocaleLowerCase("pt-BR")} válido.`);
    else if (!input.validity.valid) input.setCustomValidity(`Confira o campo ${label.toLocaleLowerCase("pt-BR")}.`);
  }} onInput={(event) => event.currentTarget.setCustomValidity("")} />;
}
