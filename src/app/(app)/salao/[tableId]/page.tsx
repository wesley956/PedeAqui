import Link from "next/link";
import {
  addDiningMemberAction,
  allocateDiningItemAction,
  openDiningTabAction,
  payDiningTabAction,
  rotateDiningQrAction,
  setDiningTableStatusAction,
  setDiningTabStatusAction,
  transferDiningTabAction,
} from "@/features/dining/actions";
import { DiningRoundComposer } from "@/features/dining/round-composer";
import styles from "@/features/dining/dining.module.css";
import { DiningService } from "@/server/dining/dining-service";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default async function DiningTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  const data = await DiningService.detail(tableId);
  const { table, tab } = data;

  return <div className={styles.page}>
    <header className={styles.header}>
      <div><Link href="/salao" className={styles.muted}>← Mesas</Link><h1>{table.name}</h1><p className={styles.muted}>{table.capacity} lugares{table.area ? ` · ${table.area}` : ""}</p></div>
      <Link href="/configuracoes/salao" className={styles.secondary}>Configurar</Link>
    </header>

    {!tab ? <>
      <div className={styles.flowSteps} aria-label="Fluxo de atendimento"><strong>1. Abrir mesa</strong><span>2. Adicionar itens</span><span>3. Enviar rodada</span><span>4. Pedir conta</span><span>5. Concluir</span></div>
      <section className={`${styles.panel} ${styles.flowPrimary}`}>
        <div><p className={styles.muted} style={{ margin: 0 }}>PRÓXIMA AÇÃO</p><h2 style={{ margin: "var(--space-1) 0" }}>Abrir atendimento</h2><p className={styles.muted}>Informe quantas pessoas estão na mesa. Uma identificação é opcional.</p></div>
        <form action={openDiningTabAction.bind(null, table.id)} className={styles.formGrid}>
          <label className={styles.field}><span>Pessoas</span><input name="guestCount" type="number" min={1} max={100} defaultValue={Math.min(table.capacity, 2)} /></label>
          <label className={styles.field}><span>Identificação opcional</span><input name="label" maxLength={120} placeholder="Família Silva" /></label>
          <button className={styles.button}>Abrir mesa</button>
        </form>
      </section>
      <details className={styles.secondaryOps}>
        <summary>Estado administrativo da mesa</summary>
        <div className={styles.secondaryOpsBody}><form action={setDiningTableStatusAction.bind(null, table.id)} className={styles.actions}><select name="status" defaultValue={table.status} className={styles.secondary}><option value="available">Livre</option><option value="reserved">Reservada</option><option value="cleaning">Limpeza</option><option value="disabled">Desativada</option></select><button className={styles.secondary}>Atualizar</button></form></div>
      </details>
    </> : <>
      <div className={styles.flowSteps} aria-label="Fluxo de atendimento"><span>✓ Mesa aberta</span><strong>{tab.status === "open" ? "Adicionar e enviar rodadas" : "Acertar conta"}</strong><span>{tab.status === "settling" ? "Conta solicitada" : "Pedir conta"}</span><span>Concluir</span></div>

      <section className={`${styles.panel} ${styles.flowPrimary}`}>
        <div className={styles.row}>
          <div><p className={styles.muted} style={{ margin: 0 }}>COMANDA #{tab.display_number}</p><strong>{tab.guest_count} pessoa(s) · {tab.status === "settling" ? "Conta solicitada" : "Em atendimento"}</strong></div>
          <div><span className={styles.muted}>Restante</span><div className={styles.metric}>{money(data.account.dueCents)}</div></div>
        </div>
        <div className={styles.actions}>
          {tab.status === "open" ? <form action={setDiningTabStatusAction.bind(null, tab.id, table.id, "settling")}><button className={styles.button}>Pedir conta</button></form> : null}
          {tab.status === "settling" && data.account.dueCents === 0 ? <form action={setDiningTabStatusAction.bind(null, tab.id, table.id, "closed")}><button className={styles.button}>Concluir e liberar mesa</button></form> : null}
          {tab.status === "settling" && data.account.dueCents > 0 ? <span className={styles.muted}>Registre o pagamento para liberar a conclusão.</span> : null}
        </div>
      </section>

      {tab.status === "open" ? <section className={styles.panel}><div><p className={styles.muted} style={{ margin: 0 }}>ATENDIMENTO</p><h2 style={{ margin: "var(--space-1) 0" }}>Adicionar itens e enviar rodada</h2></div><DiningRoundComposer categories={data.categories} products={data.products} tabId={tab.id} /></section> : null}

      <div className={styles.two}>
        <section className={styles.panel}>
          <h2 style={{ margin: 0 }}>Acompanhar rodadas</h2>
          <div className={styles.orders}>{data.orders.length === 0 ? <p className={styles.muted}>Nenhuma rodada enviada ainda.</p> : data.orders.map((order) => <article className={styles.order} key={order.id}><div className={styles.row}><strong>Pedido #{order.display_number}</strong><span className={styles.muted}>{order.production_status} · {money(Number(order.total_cents))}</span></div><div className={styles.items}>{order.items.map((item) => <div key={item.id} className={styles.row}><span>{item.quantity}× {item.product_name_snapshot}</span><span>{money(Number(item.line_total_cents))}</span></div>)}</div></article>)}</div>
        </section>

        <section className={styles.panel}>
          <h2 style={{ margin: 0 }}>Conta</h2>
          <div className={styles.row}><span>Total</span><strong>{money(data.account.totalCents)}</strong></div><div className={styles.row}><span>Pago</span><strong>{money(data.account.paidCents)}</strong></div><div className={styles.row}><span>Restante</span><strong className={styles.metric}>{money(data.account.dueCents)}</strong></div>
          {data.account.dueCents > 0 ? <form action={payDiningTabAction.bind(null, tab.id, table.id)} className={styles.formGrid}><label className={styles.field}><span>Valor</span><input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label className={styles.field}><span>Forma</span><select name="method"><option value="cash">Dinheiro</option><option value="pix">Pix</option><option value="credit_card">Crédito</option><option value="debit_card">Débito</option></select></label><label className={styles.field}><span>Pessoa</span><select name="tabMemberId"><option value="">Conta geral</option>{data.memberAccounts.map((member) => <option value={member.id} key={member.id}>{member.name} · {money(member.due_cents)}</option>)}</select></label><label className={styles.field}><span>Recebido em dinheiro</span><input name="cashTendered" inputMode="decimal" placeholder="Opcional" /></label><label className={styles.field}><span>Referência</span><input name="reference" maxLength={200} /></label><button className={styles.button}>Registrar pagamento</button></form> : <p className={styles.muted}>Conta quitada.</p>}
        </section>
      </div>

      <details className={styles.secondaryOps}>
        <summary>Pessoas e divisão da conta</summary>
        <div className={styles.secondaryOpsBody}>
          <div className={styles.members}>{data.memberAccounts.map((member) => <div className={styles.member} key={member.id}><div className={styles.row}><strong>{member.name}</strong><span>{money(member.due_cents)}</span></div><div className={styles.muted}>Atribuído {money(member.allocated_cents)} · pago {money(member.paid_cents)}</div></div>)}</div>
          <form action={addDiningMemberAction.bind(null, tab.id, table.id)} className={styles.formGrid}><label className={styles.field}><span>Nome</span><input name="name" required maxLength={80} /></label><label className={styles.field}><span>Assento</span><input name="seatNumber" type="number" min={1} max={100} /></label><button className={styles.secondary}>Adicionar pessoa</button></form>
          {data.members.length ? <div className={styles.orders}>{data.orders.flatMap((order) => order.items.map((item) => <form key={item.id} action={allocateDiningItemAction.bind(null, tab.id, table.id)} className={styles.actions}><input type="hidden" name="orderItemId" value={item.id} /><span>{item.quantity}× {item.product_name_snapshot}</span><select name="memberId" className={styles.secondary}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><input name="quantity" type="number" min={1} max={item.quantity} defaultValue={1} style={{ width: 72 }} /><button className={styles.secondary}>Atribuir</button></form>))}</div> : null}
        </div>
      </details>

      <details className={styles.secondaryOps}>
        <summary>Mais ações da comanda</summary>
        <div className={styles.secondaryOpsBody}><div className={styles.formGrid}><form action={transferDiningTabAction.bind(null, tab.id, table.id)} className={styles.field}><span>Transferir para</span><select name="targetTableId" required>{data.targets.map((target) => <option key={target.id} value={target.id}>{target.name} ({target.code})</option>)}</select><button className={styles.secondary} disabled={!data.targets.length}>Transferir mesa</button></form>{data.orders.length === 0 ? <form action={setDiningTabStatusAction.bind(null, tab.id, table.id, "canceled")} className={styles.field}><span>Cancelar comanda vazia</span><input name="reason" minLength={3} placeholder="Motivo" required /><button className={styles.danger}>Cancelar comanda</button></form> : null}</div></div>
      </details>
    </>}

    <details className={styles.secondaryOps}>
      <summary>Pedido por QR</summary>
      <div className={styles.secondaryOpsBody}><div className={styles.row}><span>{table.qr_enabled ? "Habilitado" : "Desabilitado"}</span>{table.qr_enabled ? <form action={rotateDiningQrAction.bind(null, table.id)}><button className={styles.secondary}>Rotacionar código</button></form> : null}</div>{table.qr_enabled ? <><div className={styles.qr}>{`${process.env.APP_URL ?? "http://localhost:3000"}/mesa/${table.public_code}`}</div><span className={styles.muted}>Use este endereço para gerar/imprimir o QR da mesa.</span></> : null}</div>
    </details>
  </div>;
}
