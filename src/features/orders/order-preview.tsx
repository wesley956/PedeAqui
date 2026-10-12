"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { OrderActionForm } from "./order-action-form";
import type { OrderManagerRow } from "./manager-model";
import { loadOrderPreviewAction } from "./order-preview-action";
import { paymentMethodLabels } from "@/server/checkout/schemas";
import styles from "./order-manager.module.css";

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
type PreviewResult = Awaited<ReturnType<typeof loadOrderPreviewAction>>;

export function OrderPreview({ order, revision, onClose, primaryAction }: { order: OrderManagerRow; revision: string; onClose: () => void; primaryAction?: ReactNode }) {
  const [result, setResult] = useState<{ revision: string; value: PreviewResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestRevision = `${revision}:${attempt}`;
  const current = result?.revision === requestRevision ? result.value : null;
  useEffect(() => {
    let active = true;
    void loadOrderPreviewAction(order.id).then((value) => { if (active) setResult({ revision: requestRevision, value }); }).catch(() => { if (active) setResult({ revision: requestRevision, value: { ok: false, error: "Não foi possível carregar o pedido." } }); });
    return () => { active = false; };
  }, [order.id, requestRevision]);

  return <aside className={styles.orderPreview} aria-label={`Resumo do pedido ${order.display_number}`}>
    <header className={styles.previewHeader}><div><h2>Pedido #{order.display_number}</h2><p>{order.customer_name_snapshot}</p></div><Button type="button" tone="secondary" size="sm" onClick={onClose}>Fechar</Button></header>
    {!current ? <p role="status">Carregando itens…</p> : current.ok ? <>
      <h3>Itens</h3>
      <div className={styles.previewItems}>{current.detail.items.map((item) => <div key={item.id} className={styles.previewItem}><div><strong>{item.quantity}× {item.name}</strong><strong>{money(item.total)}</strong></div>{item.modifiers.length > 0 ? <p>{item.modifiers.join(" · ")}</p> : null}{item.note ? <p><strong>Observação:</strong> {item.note}</p> : null}</div>)}</div>
      <dl className={styles.previewTotals}>
        <dt>Subtotal</dt><dd>{money(current.detail.subtotal)}</dd>
        {current.detail.discount > 0 ? <><dt>Desconto</dt><dd>−{money(current.detail.discount)}</dd></> : null}
        <dt>Entrega</dt><dd>{money(current.detail.deliveryFee)}</dd>
        <dt><strong>Total</strong></dt><dd><strong>{money(current.detail.total)}</strong></dd>
        <dt>Pagamento</dt><dd>{paymentMethodLabels[current.detail.paymentMethod as keyof typeof paymentMethodLabels] ?? current.detail.paymentMethod}</dd>
        {current.detail.changeFor !== null ? <><dt>Troco para</dt><dd>{money(current.detail.changeFor)}</dd><dt>Troco solicitado</dt><dd>{money(Math.max(0, current.detail.changeFor - current.detail.total))}</dd></> : null}
      </dl>
      {current.detail.address ? <><h3>Entrega</h3><p>{current.detail.address}</p>{current.detail.reference ? <p>Referência: {current.detail.reference}</p> : null}</> : null}
    </> : <div role="alert"><p>{current.error}</p><Button type="button" tone="secondary" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button></div>}
    <footer className={styles.previewFooter}>
      {primaryAction}
      {order.order_status === "confirmed" ? <OrderActionForm orderId={order.id} intent="print" label="Imprimir pedido" tone="secondary" /> : null}
      <Link href={{ pathname: `/pedidos/${order.id}`, query: { from: "/pedidos" } }} className={styles.detailsLink}>Ver detalhes completos</Link>
    </footer>
  </aside>;
}
