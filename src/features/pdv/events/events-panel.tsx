"use client";
import { useCallback, useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { Dialog } from "@/components/ui/feedback";
import { PosShell } from "@/features/pdv/pos-shell";
import { localDateTimeInputValue } from "@/server/checkout/scheduling";
import type { EventCreateInput } from "@/server/pdv/events/schemas";
import { createPdvEventAction, loadPdvEventsAction, reportPdvEventAction, restockPdvEventAction, transitionPdvEventAction } from "@/features/pdv/events/actions";
import styles from "@/features/pdv/pdv.module.css";
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const statusLabels = { draft: "Rascunho", active: "Ativo", closed: "Encerrado", canceled: "Cancelado" };
export function EventsPanel(props: ComponentProps<typeof PosShell>) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadPdvEventsAction>>["data"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [draft, setDraft] = useState<EventCreateInput | null>(null);
  const [restock, setRestock] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"activate" | "close" | "cancel" | null>(null);
  const [report, setReport] = useState<{ sales: number; totalCents: number; discountCents: number } | null>(null);
  // Keep the exact key for a retry after a transport failure. Change it only with the payload.
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const reload = useCallback(async () => {
    try { const result = await loadPdvEventsAction(); if (result.ok) { setData(result.data); setError(null); } else setError(result.error); }
    catch { setError("Não foi possível atualizar os eventos. Confira a conexão."); }
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => { void reload(); }, 0); const clock = window.setInterval(() => setNow(Date.now()), 30_000); return () => { window.clearTimeout(initial); window.clearInterval(clock); }; }, [reload]);
  const selected = data?.events.find(event => event.id === selectedId) ?? null;
  const isEditable = selected && ["draft", "active"].includes(selected.status);
  const canRestock = isEditable && Date.parse(selected.endsAt) > now;
  async function mutate(fingerprint: string, work: (key: string) => Promise<{ok: boolean; error: string | null}>) {
    if (lock.current) return;
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() };
    lock.current = true; setBusy(true); setError(null);
    try {
      const result = await work(request.current.key);
      if (!result.ok) { setError(result.error); return; }
      request.current = null; setDraft(null); setConfirm(null); setRestock({}); setReport(null); await reload();
    } catch { setError("A resposta não chegou. Atualize os eventos ou tente novamente com os mesmos dados."); }
    finally { lock.current = false; setBusy(false); }
  }
  function newDraft() {
    const now = new Date(), zone = data?.timeZone || "America/Sao_Paulo";
    const startsLocal = localDateTimeInputValue(now, zone), endsLocal = localDateTimeInputValue(new Date(now.getTime() + 4 * 60 * 60_000), zone);
    setDraft({ id: crypto.randomUUID(), name: "", startsLocal, endsLocal, closeStore: false, closureReason: "", closureStartsLocal: startsLocal, closureEndsLocal: endsLocal, items: [] });
  }
  function setQuantity(productId: string, text: string) {
    if (!draft) return;
    const quantity = Number(text);
    setDraft({ ...draft, items: [...draft.items.filter(i => i.productId !== productId), ...(quantity > 0 ? [{productId, quantity}] : [])] });
  }
  async function create(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (!draft.items.length) { setError("Selecione pelo menos um produto e sua quantidade."); return; }
    await mutate(JSON.stringify(["create", draft]), async key => { const result = await createPdvEventAction(draft, key); if (result.ok) setSelectedId(result.id); return result; });
  }
  function date(value: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: data?.timeZone || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
  const canSell = selected?.status === "active" && Date.parse(selected.startsAt) <= now && Date.parse(selected.endsAt) > now;
  if (selling && selected) return <div className={styles.eventSale}>
    <div className={styles.rowBetween}><strong>Evento · {selected.name}</strong><button type="button" className={styles.secondaryButton} onClick={() => setSelling(false)}>Voltar aos eventos</button></div>
    <PosShell {...props} key={selected.id} sessionNonce={`${props.sessionNonce}:event:${selected.id}`} event={{ id: selected.id, name: selected.name, startsAt: selected.startsAt, endsAt: selected.endsAt, available: Object.fromEntries(selected.items.map(i => [i.productId, i.allocated - i.sold])) }} onSaleCompleted={reload} />
  </div>;
  return <section className={styles.eventPanel} aria-label="Eventos do PDV">
    <header className={styles.rowBetween}><div><h1>Eventos</h1><p className={styles.mutedSmall}>Produtos e quantidades separados para cada evento.</p></div><div className={styles.qtyRow}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void reload()}>Atualizar eventos</button>{data?.canManage ? <button type="button" className={styles.primaryButton} aria-label="Criar evento" onClick={newDraft}>+ Novo evento</button> : null}</div></header>
    {error ? <p className={styles.statusError} role="alert">{error}</p> : null}
    {!data ? <p role="status">{error ? "A venda normal continua disponível na aba Venda." : "Carregando eventos…"}</p> : <>
      {data.events.length === 0 ? <div className={styles.empty}>Nenhum evento cadastrado.{data.canManage ? " Use + Novo evento para começar." : " Peça a um responsável para cadastrar."}</div> : <div className={styles.eventList}>{data.events.map(event => <button type="button" key={event.id} className={event.id === selectedId ? styles.customerSelected : styles.customerButton} onClick={() => { setSelectedId(event.id); setRestock({}); setReport(null); }}><strong>{event.name}</strong><span>{statusLabels[event.status]} · {date(event.startsAt)} a {date(event.endsAt)}</span></button>)}</div>}
      {selected ? <article className={`card ${styles.eventDetail}`}>
        <div className={styles.rowBetween}><h2>{selected.name}</h2><strong>{statusLabels[selected.status]}</strong></div>
        <p>{date(selected.startsAt)} a {date(selected.endsAt)} · Horário da loja ({data.timeZone})</p>
        <p>{selected.closeStore ? `Loja fechada de ${date(selected.closureStartsAt!)} até ${date(selected.closureEndsAt!)}. Motivo: ${selected.closureReason}.` : "A loja funcionará normalmente durante o evento."}</p>
        <div className={styles.eventTableWrap}><table className={styles.eventTable}><caption>Estoque do evento</caption><thead><tr><th>Produto</th><th>Separados</th><th>Vendidos</th><th>{["closed", "canceled"].includes(selected.status) || Date.parse(selected.endsAt) <= now ? "Sobras" : "Disponíveis"}</th>{data.canManage && canRestock ? <th>Repor</th> : null}</tr></thead><tbody>{selected.items.map(item => <tr key={item.productId}><td>{props.products.find(p => p.id === item.productId)?.name || "Produto indisponível"}</td><td>{item.allocated}</td><td>{item.sold}</td><td>{item.allocated - item.sold}</td>{data.canManage && canRestock ? <td><input className={styles.field} type="number" min="0" max="1000000" step="1" aria-label={`Reposição de ${props.products.find(p => p.id === item.productId)?.name || "produto"}`} value={restock[item.productId] ?? ""} onChange={event => { const value = event.currentTarget.value; setRestock(current => ({...current, [item.productId]: value})); }} /></td> : null}</tr>)}</tbody></table></div>
        <div className={styles.eventActions}>
          <button type="button" className={styles.primaryButton} disabled={!canSell || busy} onClick={() => setSelling(true)}>Vender neste evento</button>
          {data.canManage && selected.status === "draft" ? <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirm("activate")}>Ativar evento</button> : null}
          {data.canManage && isEditable ? <><button type="button" className={styles.secondaryButton} disabled={busy || !canRestock || !Object.values(restock).some(v => Number(v) > 0)} onClick={() => { const items = Object.entries(restock).filter(([,q]) => Number(q)>0).map(([productId,q]) => ({productId,quantity:Number(q)})); void mutate(JSON.stringify(["restock",selected.id,items]), key => restockPdvEventAction(selected.id,items,key)); }}>Repor quantidades</button><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirm("close")}>Encerrar evento</button><button type="button" className={styles.removeButton} disabled={busy} onClick={() => setConfirm("cancel")}>Cancelar evento</button></> : null}
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={async () => { const result = await reportPdvEventAction(selected.id); if (result.ok) setReport(result.data); else setError(result.error); }}>Relatório financeiro</button>
        </div>
        {report ? <div className={styles.section} role="status"><strong>{report.sales} vendas · Total {money(report.totalCents)} · Descontos {money(report.discountCents)}</strong><p className={styles.mutedSmall}>Recorte das vendas deste evento, já incluídas no total geral. Cancelamentos e rejeições são excluídos.</p></div> : null}
      </article> : null}
    </>}
    <Dialog open={!!draft} title="Novo evento" onClose={() => { if (!busy) setDraft(null); }}>{draft ? <form onSubmit={create} className={styles.eventDetail}><fieldset disabled={busy} className={styles.eventFields}>
      <label>Nome do evento<input className={styles.field} required minLength={2} maxLength={120} value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})}/></label>
      <div className={styles.twoColumns}><label>Início<input className={styles.field} type="datetime-local" required value={draft.startsLocal} onChange={e => setDraft({...draft, startsLocal:e.target.value,closureStartsLocal:e.target.value})}/></label><label>Término<input className={styles.field} type="datetime-local" required value={draft.endsLocal} onChange={e => setDraft({...draft,endsLocal:e.target.value,closureEndsLocal:e.target.value})}/></label></div>
      <p className={styles.mutedSmall}>Datas e horários da loja: {data?.timeZone}.</p>
      <label>A loja abrirá normalmente?<select className={styles.select} value={draft.closeStore ? "no" : "yes"} onChange={e => setDraft({...draft,closeStore:e.target.value === "no"})}><option value="yes">Sim, funcionará normalmente</option><option value="no">Não, ficará fechada temporariamente</option></select></label>
      {draft.closeStore ? <><label>Motivo do fechamento<input className={styles.field} required minLength={3} maxLength={300} value={draft.closureReason} onChange={e => setDraft({...draft,closureReason:e.target.value})}/></label><div className={styles.twoColumns}><label>Fechar a partir de<input className={styles.field} type="datetime-local" required value={draft.closureStartsLocal} onChange={e => setDraft({...draft,closureStartsLocal:e.target.value})}/></label><label>Fechar até<input className={styles.field} type="datetime-local" required value={draft.closureEndsLocal} onChange={e => setDraft({...draft,closureEndsLocal:e.target.value})}/></label></div><p className={styles.mutedSmall}>Ao ativar, novos pedidos online serão bloqueados nesse período. O robô informará o motivo. Pedidos existentes e atendimento humano continuam disponíveis.</p></> : null}
      <h3>Produtos finais e quantidades</h3><div className={styles.eventProductList}>{props.products.map(product => <label key={product.id} className={styles.rowBetween}><span>{product.name}</span><input className={styles.field} aria-label={`Quantidade de ${product.name}`} type="number" min="0" max="1000000" step="1" value={draft.items.find(i => i.productId === product.id)?.quantity ?? ""} onChange={e => setQuantity(product.id,e.target.value)}/></label>)}</div>
    </fieldset>{error ? <p className={styles.statusError} role="alert">{error}</p> : null}<button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando…" : "Salvar evento"}</button></form> : null}</Dialog>
    <Dialog open={!!confirm} title={confirm === "activate" ? "Ativar evento" : confirm === "cancel" ? "Cancelar evento" : "Encerrar evento"} onClose={() => { if (!busy) setConfirm(null); }}>
      <p>{confirm === "activate" ? selected?.closeStore ? "A loja ficará fechada para novos pedidos no período e motivo informados. Confirma a ativação?" : "A loja continuará funcionando normalmente. Confirma a ativação?" : "As vendas já realizadas serão preservadas. A suspensão temporária da loja será removida, respeitando seus horários e outras pausas."}</p>
      {error ? <p className={styles.statusError} role="alert">{error}</p> : null}
      <div className={styles.eventActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setConfirm(null)}>Voltar</button><button type="button" className={styles.primaryButton} disabled={busy} onClick={() => { if (selected && confirm) void mutate(JSON.stringify([confirm,selected.id]), key => transitionPdvEventAction(selected.id,confirm,key)); }}>{busy ? "Aguarde…" : "Confirmar"}</button></div>
    </Dialog>
  </section>;
}
