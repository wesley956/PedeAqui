"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import styles from "./product-purchase-bar.module.css";

function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

/**
 * Soma ao vivo o valor do item com as opções marcadas no formulário.
 * É só uma prévia para o cliente: o servidor recalcula o preço ao adicionar ao carrinho.
 */
export function readModifiersTotal(form: HTMLFormElement, prices: Record<string, number>, containerSurchargeCents = 0) {
  let total = 0;
  for (const input of Array.from(form.querySelectorAll<HTMLInputElement>("input"))) {
    const pricedId = input.dataset.modifierId;
    if (pricedId) {
      total += (prices[pricedId] ?? 0) * Math.max(0, Number(input.dataset.pricedQuantity ?? 0));
      continue;
    }
    if ((input.type === "radio" || input.type === "checkbox") && input.checked && /^modifier_[0-9a-f-]{36}$/i.test(input.name)) {
      total += prices[input.value] ?? 0;
    }
  }
  if (form.querySelector<HTMLInputElement>('input[name="gasSaleMode"]:checked')?.value === "with_container") total += containerSurchargeCents;
  return total;
}

function SubmitButton({ label, totalCents, disabled }: { label: string; totalCents: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={styles.submit} disabled={disabled || pending} aria-busy={pending || undefined}>
    <span>{pending ? "Adicionando…" : label}</span>
    {!disabled ? <span className={styles.total}>{money(totalCents)}</span> : null}
  </button>;
}

export function ProductPurchaseBar({ basePriceCents, modifierPrices, initialQuantity, label, unavailable, containerSurchargeCents = 0 }: {
  basePriceCents: number;
  modifierPrices: Record<string, number>;
  initialQuantity: number;
  label: string;
  unavailable: boolean;
  containerSurchargeCents?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [quantity, setQuantity] = useState(Math.min(99, Math.max(1, initialQuantity)));
  const [modifiersCents, setModifiersCents] = useState(0);

  const recompute = useCallback(() => {
    const form = rootRef.current?.closest("form");
    if (form) setModifiersCents(readModifiersTotal(form, modifierPrices, containerSurchargeCents));
  }, [modifierPrices, containerSurchargeCents]);

  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const schedule = () => window.requestAnimationFrame(recompute);
    schedule();
    form.addEventListener("change", schedule);
    form.addEventListener("click", schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(form, { subtree: true, attributes: true, attributeFilter: ["data-priced-quantity", "value", "checked"] });
    return () => {
      form.removeEventListener("change", schedule);
      form.removeEventListener("click", schedule);
      observer.disconnect();
    };
  }, [recompute]);

  const totalCents = (basePriceCents + modifiersCents) * quantity;

  return <div ref={rootRef} className={styles.bar} role="group" aria-label="Quantidade e adicionar">
    <input type="hidden" name="quantity" value={quantity} />
    <div className={styles.stepper} role="group" aria-label="Quantidade">
      <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={unavailable || quantity <= 1} aria-label="Diminuir quantidade">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M5 12h14" /></svg>
      </button>
      <output aria-live="polite" aria-label={`${quantity} unidade(s)`}>{quantity}</output>
      <button type="button" onClick={() => setQuantity((value) => Math.min(99, value + 1))} disabled={unavailable || quantity >= 99} aria-label="Aumentar quantidade">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
    <SubmitButton label={label} totalCents={totalCents} disabled={unavailable} />
  </div>;
}
