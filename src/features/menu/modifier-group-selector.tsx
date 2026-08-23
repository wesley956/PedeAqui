"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProduct } from "@/server/menu/schemas";
import styles from "./modifier-group-selector.module.css";

type Group = PublicProduct["product"]["modifier_groups"][number];
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export function ModifierGroupSelector({ group, disabled = false }: { group: Group; disabled?: boolean }) {
  if (group.selection_mode === "quantity_per_option") return <QuantityModifierGroup group={group} disabled={disabled} />;
  return <DistinctModifierGroup group={group} disabled={disabled} />;
}

function DistinctModifierGroup({ group, disabled }: { group: Group; disabled: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const firstInput = useRef<HTMLInputElement | null>(null);
  const single = group.max_selection === 1;
  const count = selected.length;
  const minimum = group.required ? Math.max(1, group.min_selection) : group.min_selection;
  const complete = count >= minimum && count <= group.max_selection;
  const instruction = group.min_selection === group.max_selection ? `Escolha ${group.min_selection}` : `Escolha de ${group.min_selection} a ${group.max_selection}`;

  useEffect(() => {
    if (!firstInput.current) return;
    firstInput.current.setCustomValidity(disabled || complete ? "" : `Selecione pelo menos ${minimum} opção(ões) em ${group.name}.`);
  }, [complete, disabled, group.name, minimum]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      if (single) return checked ? [id] : [];
      if (checked) return current.includes(id) || current.length >= group.max_selection ? current : [...current, id];
      return current.filter((value) => value !== id);
    });
  }

  return <fieldset disabled={disabled} className={styles.group}>
    <GroupHeading group={group} />
    <div className={styles.rule}><strong>{instruction}</strong><span aria-live="polite">{count}/{group.max_selection} selecionado(s){complete ? " · ok" : group.required ? " · falta selecionar" : ""}</span></div>
    <div className={styles.options}>{group.modifiers.map((modifier, index) => {
      const checked = selected.includes(modifier.id);
      const maxReached = !single && count >= group.max_selection && !checked;
      return <label key={modifier.id} className={`${styles.option} ${maxReached ? styles.optionDisabled : ""}`}>
        <span className={styles.optionName}><input ref={index === 0 ? firstInput : undefined} type={single ? "radio" : "checkbox"} name={`modifier_${group.id}`} value={modifier.id} checked={checked} disabled={disabled || maxReached} required={single && group.required} onChange={(event) => toggle(modifier.id, event.target.checked)} /><span>{modifier.name}</span></span>
        <strong>{modifier.price_cents > 0 ? `+ ${money(modifier.price_cents)}` : "Incluso"}</strong>
      </label>;
    })}</div>
  </fieldset>;
}

function QuantityModifierGroup({ group, disabled }: { group: Group; disabled: boolean }) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const validationInput = useRef<HTMLInputElement | null>(null);
  const minimum = group.required ? Math.max(1, group.min_selection) : group.min_selection;
  const total = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const complete = total >= minimum && total <= group.max_selection;
  const maxReached = total >= group.max_selection;
  const allOptionsSelected = group.modifiers.length > 0 && group.modifiers.every((modifier) => (quantities[modifier.id] ?? 0) > 0);

  useEffect(() => {
    if (validationInput.current) {
      validationInput.current.setCustomValidity(disabled || complete ? "" : minimum > 0 && total < minimum ? `Selecione pelo menos ${minimum} unidade(s) em ${group.name}.` : `O máximo é ${group.max_selection} unidade(s) em ${group.name}.`);
    }
    window.dispatchEvent(new CustomEvent("pedeaqui:quantity-group-state", {
      detail: { groupId: group.id, valid: disabled ? false : complete, allOptionsSelected, total },
    }));
  }, [allOptionsSelected, complete, disabled, group.id, group.max_selection, group.name, minimum, total]);

  function change(modifierId: string, delta: number) {
    setQuantities((current) => {
      const currentValue = current[modifierId] ?? 0;
      const nextValue = Math.max(0, currentValue + delta);
      const currentTotal = Object.values(current).reduce((sum, quantity) => sum + quantity, 0);
      if (delta > 0 && currentTotal >= group.max_selection) return current;
      return { ...current, [modifierId]: nextValue };
    });
  }

  const instruction = minimum === group.max_selection
    ? `Escolha ${group.max_selection} unidade(s) no total`
    : minimum > 0
      ? `Mínimo ${minimum} · máximo ${group.max_selection} unidade(s)`
      : `Até ${group.max_selection} unidade(s) no total`;

  return <fieldset disabled={disabled} className={styles.group}>
    <GroupHeading group={group} />
    <div className={styles.rule}><strong>{instruction}</strong><span aria-live="polite">{total} unidade(s) selecionada(s) · máximo {group.max_selection}{complete ? " · ok" : minimum > 0 ? ` · mínimo ${minimum}` : ""}</span></div>
    <input ref={validationInput} className={styles.validationInput} tabIndex={-1} aria-hidden="true" name={`modifier_group_total_${group.id}`} value={String(total)} onChange={() => undefined} />
    <div className={styles.options}>{group.modifiers.map((modifier) => {
      const quantity = quantities[modifier.id] ?? 0;
      return <div key={modifier.id} className={styles.option}>
        <span className={styles.optionName}><span>{modifier.name}</span><strong className={styles.optionPrice}>{modifier.price_cents > 0 ? `+ ${money(modifier.price_cents)} cada` : "Incluso"}</strong></span>
        <div className={styles.stepper} role="group" aria-label={`Quantidade de ${modifier.name}`}>
          <button type="button" onClick={() => change(modifier.id, -1)} disabled={disabled || quantity <= 0} aria-label={`Remover uma unidade de ${modifier.name}`}>−</button>
          <output aria-live="polite" aria-label={`${quantity} unidade(s) de ${modifier.name}`}>{quantity}</output>
          <button type="button" onClick={() => change(modifier.id, 1)} disabled={disabled || maxReached} aria-label={`Adicionar uma unidade de ${modifier.name}`}>+</button>
          <input type="hidden" name={`modifier_qty_${modifier.id}`} value={quantity} />
        </div>
      </div>;
    })}</div>
  </fieldset>;
}

function GroupHeading({ group }: { group: Group }) {
  return <div className={styles.heading}><div><legend>{group.name}</legend>{group.description ? <p>{group.description}</p> : null}</div><span className={group.required ? styles.required : styles.optional}>{group.required ? "Obrigatório" : "Opcional"}</span></div>;
}
