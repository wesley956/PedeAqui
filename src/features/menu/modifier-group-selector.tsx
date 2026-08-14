"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProduct } from "@/server/menu/schemas";
import styles from "./modifier-group-selector.module.css";

type Group = PublicProduct["modifier_groups"][number];
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }

export function ModifierGroupSelector({ group, disabled = false }: { group: Group; disabled?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const firstInput = useRef<HTMLInputElement | null>(null);
  const single = group.max_selection === 1;
  const count = selected.length;
  const complete = count >= group.min_selection && count <= group.max_selection;
  const instruction = group.min_selection === group.max_selection ? `Escolha ${group.min_selection}` : `Escolha de ${group.min_selection} a ${group.max_selection}`;

  useEffect(() => {
    if (!firstInput.current) return;
    firstInput.current.setCustomValidity(disabled || complete ? "" : `Selecione pelo menos ${group.min_selection} opção(ões) em ${group.name}.`);
  }, [complete, disabled, group.min_selection, group.name]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      if (single) return checked ? [id] : [];
      if (checked) return current.includes(id) || current.length >= group.max_selection ? current : [...current, id];
      return current.filter((value) => value !== id);
    });
  }

  return <fieldset disabled={disabled} className={styles.group}>
    <div className={styles.heading}><div><legend>{group.name}</legend>{group.description ? <p>{group.description}</p> : null}</div><span className={group.required ? styles.required : styles.optional}>{group.required ? "Obrigatório" : "Opcional"}</span></div>
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
