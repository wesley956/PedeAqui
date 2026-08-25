"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProduct } from "@/server/menu/schemas";
import styles from "./modifier-group-selector.module.css";

type Group = PublicProduct["product"]["modifier_groups"][number];
type InitialSelections = Record<string, number>;
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function isAutoDistributedFlavorGroup(group: Group) {
  return group.selection_mode === "quantity_per_option" && group.max_selection > 1 && normalize(group.name).includes("sabor");
}

function scrollToTarget(targetId: string) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  target.querySelector<HTMLElement>("button, a, input, select, textarea, [tabindex]")?.focus({ preventScroll: true });
}

export function ModifierGroupSelector({ group, disabled = false, complementTargetId, initialSelections = {} }: { group: Group; disabled?: boolean; complementTargetId?: string; initialSelections?: InitialSelections }) {
  if (isAutoDistributedFlavorGroup(group)) return <AutoDistributedFlavorGroup group={group} disabled={disabled} complementTargetId={complementTargetId} initialSelections={initialSelections} />;
  if (group.selection_mode === "quantity_per_option") return <QuantityModifierGroup group={group} disabled={disabled} complementTargetId={complementTargetId} initialSelections={initialSelections} />;
  return <DistinctModifierGroup group={group} disabled={disabled} initialSelections={initialSelections} />;
}

function DistinctModifierGroup({ group, disabled, initialSelections }: { group: Group; disabled: boolean; initialSelections: InitialSelections }) {
  const [selected, setSelected] = useState<string[]>(() => group.modifiers.filter((modifier) => (initialSelections[modifier.id] ?? 0) > 0).map((modifier) => modifier.id));
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
        {modifier.price_cents > 0 ? <strong>+ {money(modifier.price_cents)}</strong> : null}
      </label>;
    })}</div>
  </fieldset>;
}

function AutoDistributedFlavorGroup({ group, disabled, complementTargetId, initialSelections }: { group: Group; disabled: boolean; complementTargetId?: string; initialSelections: InitialSelections }) {
  const [selected, setSelected] = useState<string[]>(() => group.modifiers.filter((modifier) => (initialSelections[modifier.id] ?? 0) > 0).map((modifier) => modifier.id));
  const validationInput = useRef<HTMLInputElement | null>(null);
  const selectedSet = new Set(selected);
  const selectedModifiers = group.modifiers.filter((modifier) => selectedSet.has(modifier.id));
  const complete = !group.required || selectedModifiers.length > 0;
  const base = selectedModifiers.length > 0 ? Math.floor(group.max_selection / selectedModifiers.length) : 0;
  const remainder = selectedModifiers.length > 0 ? group.max_selection % selectedModifiers.length : 0;
  const distribution = new Map(selectedModifiers.map((modifier, index) => [modifier.id, base + (index < remainder ? 1 : 0)]));

  useEffect(() => {
    if (!validationInput.current) return;
    validationInput.current.setCustomValidity(disabled || complete ? "" : `Escolha pelo menos um sabor em ${group.name}.`);
  }, [complete, disabled, group.name]);

  function addFlavor(id: string) {
    setSelected((current) => current.includes(id) ? current : [...current, id]);
  }

  function removeFlavor(id: string) {
    setSelected((current) => current.filter((value) => value !== id));
  }

  return <fieldset disabled={disabled} className={styles.group}>
    <GroupHeading group={group} />
    <div className={styles.rule}>
      <strong>Use + para adicionar e − para remover sabores</strong>
      <span aria-live="polite">{selectedModifiers.length > 0 ? `${selectedModifiers.length} sabor(es) · ${group.max_selection} unidades divididas automaticamente` : `O PedeAqui dividirá as ${group.max_selection} unidades igualmente`}</span>
    </div>
    <input ref={validationInput} className={styles.validationInput} tabIndex={-1} aria-hidden="true" value={String(selectedModifiers.length)} onChange={() => undefined} />
    <div className={styles.options}>{group.modifiers.map((modifier) => {
      const checked = selectedSet.has(modifier.id);
      const quantity = distribution.get(modifier.id) ?? 0;
      return <div key={modifier.id} className={styles.option}>
        <span className={styles.optionName}>
          <span>{modifier.name}</span>
          {modifier.price_cents > 0 ? <strong className={styles.optionPrice}>+ {money(modifier.price_cents)} cada</strong> : null}
        </span>
        <div className={styles.stepper} role="group" aria-label={`Selecionar sabor ${modifier.name}`}>
          <button type="button" onClick={() => removeFlavor(modifier.id)} disabled={disabled || !checked} aria-label={`Remover sabor ${modifier.name}`}>−</button>
          <output aria-live="polite" aria-label={`${quantity} unidade(s) de ${modifier.name}`}>{quantity}</output>
          <button type="button" onClick={() => addFlavor(modifier.id)} disabled={disabled || checked} aria-label={`Adicionar sabor ${modifier.name}`}>+</button>
          <input type="hidden" name={`modifier_qty_${modifier.id}`} value={checked ? 1 : 0} />
        </div>
      </div>;
    })}</div>
    {selectedModifiers.length > 0 ? <div className={styles.rule}><strong>Divisão automática</strong><span>{selectedModifiers.map((modifier) => `${distribution.get(modifier.id)}x ${modifier.name}`).join(" · ")}</span></div> : null}
    {complementTargetId && complete ? <button type="button" onClick={() => scrollToTarget(complementTargetId)} style={{ justifySelf: "start", border: 0, background: "transparent", color: "#9a4a00", fontWeight: 900, padding: "6px 0", cursor: "pointer" }}>Pronto, ver complementos →</button> : null}
  </fieldset>;
}

function QuantityModifierGroup({ group, disabled, complementTargetId, initialSelections }: { group: Group; disabled: boolean; complementTargetId?: string; initialSelections: InitialSelections }) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(group.modifiers.map((modifier) => [modifier.id, Math.max(0, Number(initialSelections[modifier.id] ?? 0))])));
  const validationInput = useRef<HTMLInputElement | null>(null);
  const minimum = group.required ? Math.max(1, group.min_selection) : group.min_selection;
  const total = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const complete = total >= minimum && total <= group.max_selection;
  const maxReached = total >= group.max_selection;

  useEffect(() => {
    if (!validationInput.current) return;
    validationInput.current.setCustomValidity(disabled || complete ? "" : minimum > 0 && total < minimum ? `Selecione pelo menos ${minimum} unidade(s) em ${group.name}.` : `O máximo é ${group.max_selection} unidade(s) em ${group.name}.`);
  }, [complete, disabled, group.max_selection, group.name, minimum, total]);

  function change(modifierId: string, delta: number) {
    setQuantities((current) => {
      const currentValue = current[modifierId] ?? 0;
      const nextValue = Math.max(0, currentValue + delta);
      const currentTotal = Object.values(current).reduce((sum, quantity) => sum + quantity, 0);
      if (delta > 0 && currentTotal >= group.max_selection) return current;
      return { ...current, [modifierId]: nextValue };
    });
  }

  const instruction = minimum === group.max_selection ? `Escolha ${group.max_selection} unidade(s) no total` : minimum > 0 ? `Mínimo ${minimum} · máximo ${group.max_selection} unidade(s)` : `Até ${group.max_selection} unidade(s) no total`;

  return <fieldset disabled={disabled} className={styles.group}>
    <GroupHeading group={group} />
    <div className={styles.rule}><strong>{instruction}</strong><span aria-live="polite">{total} unidade(s) selecionada(s) · máximo {group.max_selection}{complete ? " · ok" : minimum > 0 ? ` · mínimo ${minimum}` : ""}</span></div>
    <input ref={validationInput} className={styles.validationInput} tabIndex={-1} aria-hidden="true" value={String(total)} onChange={() => undefined} />
    <div className={styles.options}>{group.modifiers.map((modifier) => {
      const quantity = quantities[modifier.id] ?? 0;
      return <div key={modifier.id} className={styles.option}>
        <span className={styles.optionName}><span>{modifier.name}</span>{modifier.price_cents > 0 ? <strong className={styles.optionPrice}>+ {money(modifier.price_cents)} cada</strong> : null}</span>
        <div className={styles.stepper} role="group" aria-label={`Quantidade de ${modifier.name}`}>
          <button type="button" onClick={() => change(modifier.id, -1)} disabled={disabled || quantity <= 0} aria-label={`Remover uma unidade de ${modifier.name}`}>−</button>
          <output aria-live="polite" aria-label={`${quantity} unidade(s) de ${modifier.name}`}>{quantity}</output>
          <button type="button" onClick={() => change(modifier.id, 1)} disabled={disabled || maxReached} aria-label={`Adicionar uma unidade de ${modifier.name}`}>+</button>
          <input type="hidden" name={`modifier_qty_${modifier.id}`} value={quantity} />
        </div>
      </div>;
    })}</div>
    {complementTargetId && complete ? <button type="button" onClick={() => scrollToTarget(complementTargetId)} style={{ justifySelf: "start", border: 0, background: "transparent", color: "#9a4a00", fontWeight: 900, padding: "6px 0", cursor: "pointer" }}>Pronto, ver complementos →</button> : null}
  </fieldset>;
}

function GroupHeading({ group }: { group: Group }) {
  return <div className={styles.heading}><div><legend>{group.name}</legend>{group.description ? <p>{group.description}</p> : null}</div><span className={group.required ? styles.required : styles.optional}>{group.required ? "Obrigatório" : "Opcional"}</span></div>;
}
