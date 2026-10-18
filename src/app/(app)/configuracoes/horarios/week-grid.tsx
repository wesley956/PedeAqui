"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResilientMutationForm } from "@/features/catalog/resilient-mutation-form";
import { saveStoreWeekAction } from "@/features/menu/actions";
import styles from "./week-grid.module.css";

export type WeekPeriod = { weekday: number; opensAt: string; closesAt: string };

// Segunda primeiro, como o restaurante pensa a semana; o banco usa 0 = domingo.
const days: Array<{ weekday: number; label: string }> = [
  { weekday: 1, label: "Segunda" },
  { weekday: 2, label: "Terça" },
  { weekday: 3, label: "Quarta" },
  { weekday: 4, label: "Quinta" },
  { weekday: 5, label: "Sexta" },
  { weekday: 6, label: "Sábado" },
  { weekday: 0, label: "Domingo" },
];

type Slot = { id: number; opensAt: string; closesAt: string };

type WeekState = { slots: Record<number, Slot[]>; nextId: number };

function initialWeek(periods: readonly WeekPeriod[]): WeekState {
  const slots: Record<number, Slot[]> = {};
  for (const day of days) slots[day.weekday] = [];
  periods.forEach((period, index) => slots[period.weekday]?.push({ id: index + 1, opensAt: period.opensAt, closesAt: period.closesAt }));
  return { slots, nextId: periods.length + 1 };
}

/** Grade da semana: cada dia aberto/fechado, um ou mais períodos, "copiar para todos" e um único Salvar. */
export function WeekGrid({ periods }: { periods: readonly WeekPeriod[] }) {
  const [state, setState] = useState<WeekState>(() => initialWeek(periods));
  const [copied, setCopied] = useState<number | null>(null);
  const week = state.slots;

  const update = (weekday: number, slots: Slot[]) => {
    setCopied(null);
    setState((current) => ({ ...current, slots: { ...current.slots, [weekday]: slots } }));
  };

  // Novos períodos ganham ids sequenciais guardados no próprio estado (só servem de chave da lista).
  const addSlots = (weekday: number, slots: Slot[], extra: Array<Pick<Slot, "opensAt" | "closesAt">>) => {
    setCopied(null);
    setState((current) => ({
      nextId: current.nextId + extra.length,
      slots: { ...current.slots, [weekday]: [...slots, ...extra.map((item, index) => ({ ...item, id: current.nextId + index }))] },
    }));
  };

  const copyToAll = (weekday: number) => {
    setState((current) => {
      const source = current.slots[weekday] ?? [];
      let nextId = current.nextId;
      const slots: Record<number, Slot[]> = {};
      for (const day of days) slots[day.weekday] = source.map((item) => ({ id: nextId++, opensAt: item.opensAt, closesAt: item.closesAt }));
      return { slots, nextId };
    });
    setCopied(weekday);
  };

  const serialized = JSON.stringify(days.flatMap((day) => (week[day.weekday] ?? []).map((item) => ({ weekday: day.weekday, opensAt: item.opensAt, closesAt: item.closesAt }))));
  const openDays = days.filter((day) => (week[day.weekday] ?? []).length > 0).length;

  return (
    <ResilientMutationForm action={saveStoreWeekAction} successReset={false} className={styles.form}>
      <input type="hidden" name="periods" value={serialized} />
      <p className={styles.summary}>{openDays === 0 ? "Nenhum dia aberto: a loja fica fechada." : `${openDays} ${openDays === 1 ? "dia aberto" : "dias abertos"} na semana.`} Fechamento depois da meia-noite? Basta pôr a hora de fechar menor que a de abrir (ex.: 18:00 → 02:00).</p>
      <div className={styles.grid} role="list" aria-label="Horários da semana">
        {days.map((day) => {
          const slots = week[day.weekday] ?? [];
          const open = slots.length > 0;
          return (
            <section key={day.weekday} className={styles.day} role="listitem" aria-label={day.label} data-open={open}>
              <div className={styles.dayHeader}>
                <strong>{day.label}</strong>
                <label className={styles.openToggle}>
                  <input type="checkbox" checked={open} onChange={(event) => (event.target.checked ? addSlots(day.weekday, [], [{ opensAt: "18:00", closesAt: "23:00" }]) : update(day.weekday, []))} />
                  <span>{open ? "Aberto" : "Fechado"}</span>
                </label>
              </div>
              {open ? (
                <div className={styles.slots}>
                  {slots.map((item, index) => {
                    const overnight = item.closesAt !== "" && item.opensAt !== "" && item.closesAt < item.opensAt;
                    return (
                      <div key={item.id} className={styles.slot}>
                        <label>
                          <span className={styles.srOnly}>{day.label}, período {index + 1}: abre</span>
                          <input type="time" required value={item.opensAt} onChange={(event) => update(day.weekday, slots.map((value) => value.id === item.id ? { ...value, opensAt: event.target.value } : value))} />
                        </label>
                        <span aria-hidden="true">→</span>
                        <label>
                          <span className={styles.srOnly}>{day.label}, período {index + 1}: fecha</span>
                          <input type="time" required value={item.closesAt} onChange={(event) => update(day.weekday, slots.map((value) => value.id === item.id ? { ...value, closesAt: event.target.value } : value))} />
                        </label>
                        {overnight ? <span className={styles.nextDay}>(+1 dia)</span> : null}
                        <button type="button" className={styles.linkButton} onClick={() => update(day.weekday, slots.filter((value) => value.id !== item.id))} aria-label={`Remover período ${index + 1} de ${day.label}`}>Remover</button>
                      </div>
                    );
                  })}
                  <div className={styles.dayActions}>
                    <button type="button" className={styles.linkButton} onClick={() => addSlots(day.weekday, slots, [{ opensAt: "", closesAt: "" }])}>+ Outro período</button>
                    <button type="button" className={styles.linkButton} onClick={() => copyToAll(day.weekday)}>Copiar para todos os dias</button>
                    {copied === day.weekday ? <span className={styles.copied} role="status">Copiado. Confira e salve.</span> : null}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className={styles.actions} data-sticky-actions>
        <Button type="submit" loadingLabel="Salvando horários…">Salvar horários</Button>
      </div>
    </ResilientMutationForm>
  );
}
