"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { setFlavorAvailabilityAction, setProductAvailabilityAction, type AvailabilityResult } from "@/features/catalog/availability-actions";
import styles from "./availability-board.module.css";

export type AvailabilityEntry = {
  kind: "product" | "flavor";
  /** Produto: id do produto. Sabor: id de uma das cópias (o servidor pausa todas pelo nome). */
  id: string;
  name: string;
  detail: string;
  state: "on" | "off" | "partial";
  statusLabel: string;
  searchText: string;
};

type Filter = "todos" | "pausados" | "produtos" | "sabores";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "todos", label: "Tudo" },
  { key: "pausados", label: "Pausados agora" },
  { key: "produtos", label: "Produtos" },
  { key: "sabores", label: "Sabores e adicionais" },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("pt-BR");
}

const entryKey = (entry: AvailabilityEntry) => `${entry.kind}:${entry.id}`;

export function AvailabilityBoard({ products, flavors, initialQuery, initialFilter, autoFocus }: {
  products: readonly AvailabilityEntry[];
  flavors: readonly AvailabilityEntry[];
  initialQuery: string;
  initialFilter: Filter;
  autoFocus: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; result: AvailabilityResult } | null>(null);
  // Na maioria das vezes "acabou" vale só para hoje: por padrão o item volta sozinho às 00:00.
  const [untilTomorrow, setUntilTomorrow] = useState(true);
  const [isPending, startTransition] = useTransition();

  const normalizedQuery = normalize(query);
  const pausedCount = products.filter((entry) => entry.state !== "on").length + flavors.filter((entry) => entry.state !== "on").length;

  const visible = useMemo(() => {
    const matches = (entry: AvailabilityEntry) => !normalizedQuery || entry.searchText.includes(normalizedQuery);
    const paused = (entry: AvailabilityEntry) => filter !== "pausados" || entry.state !== "on";
    return {
      products: filter === "sabores" ? [] : products.filter((entry) => matches(entry) && paused(entry)),
      flavors: filter === "produtos" ? [] : flavors.filter((entry) => matches(entry) && paused(entry)),
    };
  }, [products, flavors, normalizedQuery, filter]);

  function run(entry: AvailabilityEntry, action: () => Promise<AvailabilityResult>) {
    const key = entryKey(entry);
    setBusyKey(key);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await action();
        setFeedback({ key, result });
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ key, result: { ok: false, message: "Não foi possível concluir agora. Tente novamente." } });
      } finally {
        setBusyKey(null);
      }
    });
  }

  function toggle(entry: AvailabilityEntry, markBlockedProductsSoldOut = false) {
    // Ligado → desliga. Desligado ou parcialmente pausado → liga em todos os grupos.
    const turnOn = entry.state !== "on";
    if (entry.kind === "product") {
      run(entry, () => setProductAvailabilityAction({ productId: entry.id, availability: turnOn ? "available" : "sold_out", untilTomorrow }));
    } else {
      run(entry, () => setFlavorAvailabilityAction({ modifierId: entry.id, active: turnOn, markBlockedProductsSoldOut, untilTomorrow }));
    }
  }

  const total = visible.products.length + visible.flavors.length;

  return (
    <section className={styles.board} aria-label="Disponibilidade agora">
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className={styles.searchLabel}>Buscar produto, sabor ou adicional</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: calabresa, coca, bacon"
            autoComplete="off"
            autoFocus={autoFocus}
            enterKeyHint="search"
          />
        </label>
        <div className={styles.filters} role="group" aria-label="Filtrar lista">
          {filters.map((item) => (
            <button key={item.key} type="button" className={styles.filterChip} aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}>
              {item.label}{item.key === "pausados" && pausedCount > 0 ? <span className={styles.badge}>{pausedCount}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <label className={styles.untilTomorrow} title="O que você desligar agora volta a ficar à venda no dia seguinte. Desmarque para deixar pausado até você reativar.">
        <input type="checkbox" checked={untilTomorrow} onChange={(event) => setUntilTomorrow(event.target.checked)} />
        <span><strong>Voltar sozinho amanhã às 00:00</strong><span className={styles.untilTomorrowHint}> — desmarque para deixar pausado até você reativar.</span></span>
      </label>

      {total === 0 ? (
        <div className={styles.empty}>
          <strong>{filter === "pausados" && !normalizedQuery ? "Nada pausado agora" : "Nada encontrado"}</strong>
          <span>{filter === "pausados" && !normalizedQuery ? "Tudo está à venda." : "Confira a grafia ou procure por outro nome."}</span>
        </div>
      ) : null}

      {visible.flavors.length > 0 ? (
        <Section title="Sabores e adicionais" count={visible.flavors.length}>
          {visible.flavors.map((entry) => <Row key={entryKey(entry)} entry={entry} busy={busyKey === entryKey(entry) && isPending} feedback={feedback?.key === entryKey(entry) ? feedback.result : null} onToggle={toggle} onDismiss={() => setFeedback(null)} />)}
        </Section>
      ) : null}

      {visible.products.length > 0 ? (
        <Section title="Produtos" count={visible.products.length}>
          {visible.products.map((entry) => <Row key={entryKey(entry)} entry={entry} busy={busyKey === entryKey(entry) && isPending} feedback={feedback?.key === entryKey(entry) ? feedback.result : null} onToggle={toggle} onDismiss={() => setFeedback(null)} />)}
        </Section>
      ) : null}

      <p className={styles.hint}>Desligue quando algo acabar. Produto desligado aparece como esgotado no cardápio; sabor desligado some das escolhas em todos os produtos.</p>
      <p className={styles.footerLinks}>Para mudar preço, foto ou montar grupos: <Link href="/cardapio/produtos">Produtos</Link> · <Link href="/cardapio/adicionais">Sabores e Adicionais</Link></p>
    </section>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>{title} <span>{count}</span></h2>
      <ul className={styles.list}>{children}</ul>
    </section>
  );
}

function Row({ entry, busy, feedback, onToggle, onDismiss }: {
  entry: AvailabilityEntry;
  busy: boolean;
  feedback: AvailabilityResult | null;
  onToggle: (entry: AvailabilityEntry, markBlockedProductsSoldOut?: boolean) => void;
  onDismiss: () => void;
}) {
  const on = entry.state === "on";
  const blockedProducts = feedback?.blockers?.flatMap((blocker) => blocker.products) ?? [];
  const uniqueBlocked = [...new Map(blockedProducts.map((product) => [product.id, product])).values()];
  return (
    <li className={styles.row} data-state={entry.state}>
      <div className={styles.rowMain}>
        <span className={styles.name}>{entry.name}</span>
        <span className={styles.detail}>{entry.detail}</span>
      </div>
      <span className={styles.status} data-state={entry.state}>{entry.statusLabel}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? (entry.kind === "product" ? "Marcar como esgotado" : "Pausar") : "Reativar"}: ${entry.name}`}
        className={styles.switch}
        onClick={() => onToggle(entry)}
        disabled={busy}
      >
        <span className={styles.track} aria-hidden="true" />
        <span className={styles.switchLabel}>{busy ? "Salvando…" : on ? "Ligado" : entry.state === "partial" ? "Ligar todos" : "Desligado"}</span>
      </button>

      {feedback && uniqueBlocked.length > 0 ? (
        <div className={styles.impact} role="alert">
          <strong>Esses produtos ficariam sem opção suficiente para escolher:</strong>
          <span>{uniqueBlocked.map((product) => product.name).join(", ")}</span>
          <div className={styles.impactActions}>
            <button type="button" className={styles.primaryButton} onClick={() => onToggle(entry, true)} disabled={busy}>Pausar e marcar {uniqueBlocked.length === 1 ? "o produto como esgotado" : `os ${uniqueBlocked.length} produtos como esgotados`}</button>
            <button type="button" className={styles.secondaryButton} onClick={onDismiss}>Cancelar</button>
          </div>
        </div>
      ) : feedback ? (
        <span className={styles.message} role={feedback.ok ? "status" : "alert"} data-ok={feedback.ok}>{feedback.message}</span>
      ) : null}
    </li>
  );
}
