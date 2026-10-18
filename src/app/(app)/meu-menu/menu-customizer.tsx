"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { NavigationIcon } from "@/components/ui/navigation-icon";
import { resetNavigationPinsAction, saveNavigationPinsAction } from "@/features/preferences/navigation-actions";
import styles from "./menu-customizer.module.css";

export type MenuCustomizerItem = { key: string; label: string };

type Result = { ok: boolean; message: string };

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Editor do menu principal: arrastar (mouse) ou setas (toque e teclado) para ordenar,
 * "Tirar" para mandar o item de volta aos grupos de baixo e "Adicionar" para fixar.
 */
export function MenuCustomizer({ items, initialPinned, customized, limit }: { items: readonly MenuCustomizerItem[]; initialPinned: readonly string[]; customized: boolean; limit: number }) {
  const router = useRouter();
  const labels = new Map(items.map((item) => [item.key, item.label]));
  const [pinned, setPinned] = useState<string[]>(() => initialPinned.filter((key) => labels.has(key)));
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();

  const available = items.filter((item) => !pinned.includes(item.key));
  const dirty = pinned.join(",") !== initialPinned.join(",");
  const full = pinned.length >= limit;

  function update(next: string[]) {
    setPinned(next);
    setResult(null);
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    if (dragging !== null && dragging !== index) update(move(pinned, dragging, index));
    setDragging(null);
    setDropTarget(null);
  }

  function run(action: () => Promise<Result>) {
    startTransition(async () => {
      try {
        const next = await action();
        setResult(next);
        if (next.ok) router.refresh();
      } catch {
        setResult({ ok: false, message: "Não foi possível concluir agora. Tente novamente." });
      }
    });
  }

  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="menu-pinned-title">
        <div className={styles.panelHeader}>
          <h2 id="menu-pinned-title">No menu principal</h2>
          <span className={styles.counter}>{pinned.length} de {limit}</span>
        </div>
        <p className={styles.hint}>Arraste pela alça ⋮⋮ ou use as setas. A ordem daqui é a ordem do menu; no celular, os 4 primeiros ficam na barra de baixo.</p>
        {pinned.length === 0 ? <p className={styles.empty}>Nenhum item fixado. Adicione pelo menos um ao lado.</p> : (
          <ol className={styles.list} aria-label="Itens do menu principal, em ordem">
            {pinned.map((key, index) => {
              const label = labels.get(key) ?? key;
              return (
                <li
                  key={key}
                  className={styles.row}
                  draggable
                  data-dragging={dragging === index || undefined}
                  data-drop-target={dropTarget === index && dragging !== index ? true : undefined}
                  onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", key); }}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (dropTarget !== index) setDropTarget(index); }}
                  onDragLeave={() => setDropTarget((value) => (value === index ? null : value))}
                  onDrop={(event) => handleDrop(event, index)}
                  onDragEnd={() => { setDragging(null); setDropTarget(null); }}
                >
                  <span className={styles.handle} aria-hidden="true">⋮⋮</span>
                  <span className={styles.position} aria-hidden="true">{index + 1}</span>
                  <span className={styles.icon} aria-hidden="true"><NavigationIcon name={key} width={18} height={18} /></span>
                  <span className={styles.label}>{label}</span>
                  <span className={styles.rowActions}>
                    <button type="button" className={styles.iconButton} onClick={() => update(move(pinned, index, index - 1))} disabled={index === 0} aria-label={`Subir ${label}`} title="Subir">↑</button>
                    <button type="button" className={styles.iconButton} onClick={() => update(move(pinned, index, index + 1))} disabled={index === pinned.length - 1} aria-label={`Descer ${label}`} title="Descer">↓</button>
                    <button type="button" className={styles.textButton} onClick={() => update(pinned.filter((value) => value !== key))} aria-label={`Tirar ${label} do menu principal`}>Tirar</button>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="menu-available-title">
        <div className={styles.panelHeader}>
          <h2 id="menu-available-title">Outros itens</h2>
          <span className={styles.counter}>{available.length}</span>
        </div>
        <p className={styles.hint}>Itens fora do menu principal continuam acessíveis em Gestão e Conta e ajustes.</p>
        {available.length === 0 ? <p className={styles.empty}>Todos os itens já estão no menu principal.</p> : (
          <ul className={styles.list} aria-label="Itens disponíveis">
            {available.map((item) => (
              <li key={item.key} className={styles.row}>
                <span className={styles.icon} aria-hidden="true"><NavigationIcon name={item.key} width={18} height={18} /></span>
                <span className={styles.label}>{item.label}</span>
                <span className={styles.rowActions}>
                  <button type="button" className={styles.textButton} onClick={() => update([...pinned, item.key])} disabled={full} aria-label={`Adicionar ${item.label} ao menu principal`}>+ Adicionar</button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {full ? <p className={styles.hint}>Limite de {limit} itens atingido. Tire um item para adicionar outro.</p> : null}
      </section>

      <div className={styles.footer}>
        {result ? <span role={result.ok ? "status" : "alert"} aria-live="polite" className={styles.message} data-ok={result.ok}>{result.message}</span> : dirty ? <span className={styles.message}>Alterações ainda não salvas.</span> : null}
        {customized ? <Button type="button" tone="ghost" onClick={() => run(resetNavigationPinsAction)} disabled={isPending}>Restaurar padrão</Button> : null}
        <Button type="button" onClick={() => run(() => saveNavigationPinsAction(pinned))} disabled={isPending || pinned.length === 0 || (!dirty && customized)} loading={isPending} loadingLabel="Salvando…">Salvar menu</Button>
      </div>
    </div>
  );
}
