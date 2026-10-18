"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { elapsedLabel, orderItemsSummary, type OrderManagerRow } from "@/features/orders/manager-model";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import styles from "./mobile-order-list.module.css";

export type MobileOrderTab = { key: string; label: string };

export type MobileOrderEntry = {
  order: OrderManagerRow;
  /** Em qual aba de etapa o pedido aparece (ex.: "novos", "preparo", "prontos"). */
  tab: string;
  /** Próxima ação do pedido (um botão), como no quadro do computador. */
  action: ReactNode | null;
  /** Ações que ficam no "⋯": marcar pago, recusar… */
  extraActions?: ReactNode;
  late: boolean;
  /** Destaca a próxima ação em laranja (pedido novo, esperando aceite). */
  urgent?: boolean;
};

const settled = new Set(["paid", "partially_refunded", "refunded"]);

function money(cents: number | string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
}

function fulfillmentLabel(order: OrderManagerRow) {
  if (order.fulfillment_type === "delivery") return "Entrega";
  if (order.fulfillment_type === "pickup") return "Retirada";
  if (order.fulfillment_type === "table") return "Mesa";
  return "No balcão";
}

function paymentLabel(order: OrderManagerRow) {
  const method = order.payment_method_snapshot ? paymentMethodLabels[order.payment_method_snapshot as keyof typeof paymentMethodLabels] ?? null : null;
  if (settled.has(order.payment_status)) return { text: method ? `${method} · pago` : "Pago", paid: true };
  return { text: method ? `${method} · a receber` : "Pagamento pendente", paid: false };
}

/**
 * Lista de pedidos do celular: abas por etapa, cartão compacto (cliente, total, tipo, pagamento, tempo e itens),
 * um botão com a próxima ação e o "⋯" com os detalhes e as outras ações. No computador continua o quadro completo.
 */
export function MobileOrderList({ entries, tabs, now, query, onQueryChange, soundEnabled, soundLabel, onToggleSound, detailsFrom = "/pedidos" }: {
  entries: readonly MobileOrderEntry[];
  tabs: readonly MobileOrderTab[];
  now: number;
  query: string;
  onQueryChange: (value: string) => void;
  soundEnabled: boolean;
  soundLabel: string;
  onToggleSound: () => void;
  detailsFrom?: string;
}) {
  const [chosenTab, setChosenTab] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(Boolean(query));
  const [sheetId, setSheetId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.tab, (counts.get(entry.tab) ?? 0) + 1);
  const firstTab = tabs[0]?.key ?? "todos";
  // Abre em "Novos" quando há pedido esperando; senão mostra todos. A escolha da pessoa vale até ela trocar.
  const activeTab = chosenTab ?? ((counts.get(firstTab) ?? 0) > 0 ? firstTab : "todos");
  const visible = activeTab === "todos" ? entries : entries.filter((entry) => entry.tab === activeTab);
  const sheetEntry = sheetId ? entries.find((entry) => entry.order.id === sheetId) ?? null : null;

  const openSheet = (orderId: string) => {
    setSheetId(orderId);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  };
  const closeSheet = () => {
    dialogRef.current?.close();
  };

  return (
    <section className={styles.root} aria-label="Pedidos ativos">
      <div className={styles.controls}>
        <button type="button" className={styles.iconButton} aria-label={searchOpen ? "Fechar busca" : "Buscar pedido"} aria-expanded={searchOpen} onClick={() => { if (searchOpen) onQueryChange(""); setSearchOpen(!searchOpen); }}>
          {searchOpen
            ? <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            : <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>}
        </button>
        {searchOpen ? <label className={styles.search}>
          <span className={styles.visuallyHidden}>Buscar pedido</span>
          <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Número ou nome do cliente" autoFocus enterKeyHint="search" />
        </label> : <span className={styles.spacer} />}
        <button type="button" className={styles.soundButton} data-on={soundEnabled} aria-pressed={soundEnabled} onClick={onToggleSound} title={soundLabel}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H3v6h3l5 4z" />{soundEnabled ? <path d="M15.5 8.5a5 5 0 0 1 0 7" /> : <path d="m16 9 5 6M21 9l-5 6" />}</svg>
          {soundEnabled ? "Som" : "Sem som"}
        </button>
      </div>

      <nav className={styles.tabs} aria-label="Etapas dos pedidos">
        {[...tabs, { key: "todos", label: "Todos" }].map((tab) => {
          const count = tab.key === "todos" ? entries.length : counts.get(tab.key) ?? 0;
          return <button key={tab.key} type="button" className={styles.tab} aria-pressed={activeTab === tab.key} onClick={() => setChosenTab(tab.key)}>
            {tab.label} <span className={styles.count} data-highlight={tab.key === firstTab && count > 0}>{count}</span>
          </button>;
        })}
      </nav>

      <ul className={styles.list}>
        {visible.map((entry) => {
          const { order } = entry;
          const payment = paymentLabel(order);
          const summary = orderItemsSummary(order.items_preview);
          return <li key={order.id} className={styles.card} data-late={entry.late || undefined}>
            <Link href={{ pathname: `/pedidos/${order.id}`, query: { from: detailsFrom } }} className={styles.cardLink} aria-label={`Abrir pedido ${order.display_number} de ${order.customer_name_snapshot}`}>
              <span className={styles.lineOne}><strong className={styles.number}>#{order.display_number}</strong><span className={styles.customer}>{order.customer_name_snapshot}</span><strong className={styles.total}>{money(order.total_cents)}</strong></span>
              <span className={styles.lineTwo}><span>{fulfillmentLabel(order)}</span><span aria-hidden="true">·</span><span data-paid={payment.paid}>{payment.text}</span><span aria-hidden="true">·</span><span data-late={entry.late || undefined}>{elapsedLabel(order.created_at, now)}</span></span>
              {summary ? <span className={styles.items}>{summary}</span> : null}
            </Link>
            <div className={styles.actions}>
              <div className={styles.primary} data-urgent={entry.urgent || undefined}>{entry.action ?? <Link href={{ pathname: `/pedidos/${order.id}`, query: { from: detailsFrom } }} className={styles.secondaryLink}>Abrir pedido</Link>}</div>
              <button type="button" className={styles.more} aria-label={`Mais ações do pedido ${order.display_number}`} onClick={() => openSheet(order.id)}>⋯</button>
            </div>
          </li>;
        })}
      </ul>
      {visible.length === 0 ? <p className={styles.empty}>{query ? "Nenhum pedido encontrado." : activeTab === "todos" ? "Nenhum pedido ativo. Os novos aparecem aqui sozinhos." : "Nenhum pedido nesta etapa."}</p> : null}

      <dialog ref={dialogRef} className={styles.sheet} aria-label={sheetEntry ? `Pedido ${sheetEntry.order.display_number}` : "Pedido"} onClose={() => setSheetId(null)} onClick={(event) => { if (event.target === event.currentTarget) closeSheet(); }}>
        {sheetEntry ? <div className={styles.sheetBody}>
          <span className={styles.grab} aria-hidden="true" />
          <div className={styles.sheetHead}>
            <span className={styles.lineOne}><strong className={styles.number}>#{sheetEntry.order.display_number}</strong><span className={styles.customer}>{sheetEntry.order.customer_name_snapshot}</span><strong className={styles.total}>{money(sheetEntry.order.total_cents)}</strong></span>
            <span className={styles.lineTwo}><span>{fulfillmentLabel(sheetEntry.order)}</span><span aria-hidden="true">·</span><span>{paymentLabel(sheetEntry.order).text}</span><span aria-hidden="true">·</span><span>{elapsedLabel(sheetEntry.order.created_at, now)}</span></span>
          </div>
          {sheetEntry.order.items_preview && sheetEntry.order.items_preview.length > 0 ? <ul className={styles.sheetItems}>
            {sheetEntry.order.items_preview.map((item, index) => <li key={index}>
              <span><strong>{item.quantity}×</strong> {item.name}</span>
              {item.options.length > 0 ? <small>{item.options.join(" · ")}</small> : null}
              {item.note ? <small>Obs.: {item.note}</small> : null}
            </li>)}
          </ul> : null}
          {sheetEntry.action ? <div className={styles.sheetPrimary} data-urgent={sheetEntry.urgent || undefined}>{sheetEntry.action}</div> : null}
          <div className={styles.sheetGrid}>
            <Link href={{ pathname: `/pedidos/${sheetEntry.order.id}`, query: { from: detailsFrom } }} className={styles.secondaryLink}>Abrir pedido completo</Link>
            {sheetEntry.extraActions}
          </div>
          <button type="button" className={styles.close} onClick={closeSheet}>Fechar</button>
        </div> : null}
      </dialog>
    </section>
  );
}
