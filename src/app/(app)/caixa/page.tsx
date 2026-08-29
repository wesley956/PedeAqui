import Link from "next/link";
import { cashMovementAction, closeCashSessionAction, openCashSessionAction } from "@/features/cash/actions";
import { cashMovementLabels, type CashMovementType } from "@/features/cash/model";
import styles from "@/features/cash/cash.module.css";
import { CashService } from "@/server/cash/cash-service";

function money(value: unknown) {
  const cents = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
function dateTime(value: unknown) { return typeof value === "string" ? new Date(value).toLocaleString("pt-BR") : "—"; }

export default async function CashPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const notice = await searchParams;
  const data = await CashService.loadDashboard();
  const { registers, sessions, currentSession, movements, abilities } = data;
  const summary = data.summary as { expected_cash_cents?: number; totals?: Record<string, number> } | null;
  const totals = summary?.totals ?? {};
  const openByRegister = new Map(sessions.filter((session) => session.status === "open").map((session) => [session.cash_register_id, session]));
  const freeRegisters = registers.filter((register) => register.active && !openByRegister.has(register.id));

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.muted}>OPERAÇÃO</p><h1>Caixa</h1><p className={styles.muted}>Abra o turno, acompanhe o saldo e registre entradas ou saídas quando precisar.</p></div>
      {abilities.manage ? <div className={styles.headerActions}><Link href="/configuracoes/caixa" className={styles.secondary}>Configurar caixas</Link></div> : null}
    </header>

    {notice.ok ? <div className={styles.notice} data-tone="success">{notice.ok}</div> : null}
    {notice.error ? <div className={styles.notice} data-tone="danger">{notice.error}</div> : null}

    {currentSession ? <>
      <div className={styles.statusBar} aria-label="Resumo do turno de caixa">
        <Metric label="Caixa" value={currentSession.register?.name ?? "Caixa"} />
        <Metric label="Aberto em" value={dateTime(currentSession.opened_at)} />
        <Metric label="Saldo esperado" value={money(summary?.expected_cash_cents)} primary />
        <Metric label="Vendas em dinheiro" value={money(totals.sales_cents)} />
        <Metric label="Suprimentos" value={money(totals.supplies_cents)} />
        <Metric label="Sangrias" value={money(totals.withdrawals_cents)} />
      </div>

      <div className={styles.operationGrid}>
        {abilities.supply ? <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>Adicionar dinheiro</h2><p>Registre um valor que entrou manualmente no caixa.</p></div>
          <form action={cashMovementAction.bind(null, "supply", currentSession.id)} className={styles.form}>
            <input className={styles.input} name="amount" required inputMode="decimal" placeholder="Valor, ex.: 100,00" />
            <input className={styles.input} name="reason" required minLength={3} maxLength={500} placeholder="Motivo da entrada" />
            <button className={styles.primary} type="submit">Registrar entrada</button>
          </form>
        </article> : null}

        {abilities.withdraw ? <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>Retirar dinheiro</h2><p>Registre uma sangria. O PedeAqui impede retirada acima do saldo permitido.</p></div>
          <form action={cashMovementAction.bind(null, "withdrawal", currentSession.id)} className={styles.form}>
            <input className={styles.input} name="amount" required inputMode="decimal" placeholder="Valor, ex.: 200,00" />
            <input className={styles.input} name="reason" required minLength={3} maxLength={500} placeholder="Motivo da retirada" />
            <button className={styles.danger} type="submit">Registrar retirada</button>
          </form>
        </article> : null}

        {abilities.close ? <article className={styles.panel}>
          <div className={styles.panelHeader}><h2>Fechar e conferir</h2><p>Informe quanto há fisicamente no caixa. O PedeAqui calcula a diferença automaticamente.</p></div>
          <form action={closeCashSessionAction.bind(null, currentSession.id)} className={styles.form}>
            <input className={styles.input} name="countedCash" required inputMode="decimal" placeholder="Dinheiro contado" />
            <input className={styles.input} name="note" maxLength={500} placeholder="Observação opcional" />
            <button className={styles.danger} type="submit">Conferir e fechar turno</button>
          </form>
        </article> : null}
      </div>

      <article className={styles.panel}>
        <div className={styles.panelHeader}><h2>Movimentos deste turno</h2><p>Veja tudo o que entrou e saiu durante o turno.</p></div>
        {movements.length === 0 ? <p className={styles.muted}>Nenhum movimento ainda.</p> : <div className={styles.movements}>{movements.map((raw) => {
          const movement = raw as Record<string, unknown>;
          const type = String(movement.movement_type) as CashMovementType;
          const outgoing = movement.direction === "out";
          return <div key={String(movement.id)} className={styles.movement}>
            <div><strong>{cashMovementLabels[type] ?? type}</strong><div className={styles.movementMeta}>{dateTime(movement.created_at)}{movement.reason ? ` · ${String(movement.reason)}` : ""}</div></div>
            <strong className={styles.movementAmount} data-direction={outgoing ? "out" : "in"}>{outgoing ? "−" : "+"}{money(movement.amount_cents)}</strong>
          </div>;
        })}</div>}
      </article>
    </> : <article className={`${styles.panel} ${styles.openPanel}`}>
      <div className={styles.panelHeader}><h2>Abrir turno</h2><p>Abra um caixa para começar a receber vendas em dinheiro.</p></div>
      {abilities.open && freeRegisters.length > 0 ? <form action={openCashSessionAction} className={styles.formGrid}>
        <label className={styles.field}><span>CAIXA</span><select className={styles.select} name="cashRegisterId" required>{freeRegisters.map((register) => <option key={register.id} value={register.id}>{register.code} · {register.name}</option>)}</select></label>
        <label className={styles.field}><span>SALDO INICIAL</span><input className={styles.input} name="openingBalance" inputMode="decimal" defaultValue="0,00" /></label>
        <label className={styles.field}><span>OBSERVAÇÃO</span><input className={styles.input} name="note" maxLength={500} placeholder="Opcional" /></label>
        <button className={styles.primary} type="submit">Abrir caixa</button>
      </form> : <p className={styles.muted}>{freeRegisters.length === 0 ? "Não há caixa ativo e livre. Verifique a configuração ou aguarde o encerramento de outro turno." : "Seu perfil não possui permissão para abrir caixa."}</p>}
    </article>}

    <details className={styles.secondarySection}>
      <summary>Histórico de turnos</summary>
      <div className={styles.secondaryBody}>{sessions.length === 0 ? <p className={styles.muted}>Nenhum turno registrado.</p> : sessions.slice(0, 15).map((session) => <div key={session.id} className={styles.session}>
        <strong>{session.register?.name ?? "Caixa"} · {session.status === "open" ? "Aberto" : "Fechado"}</strong>
        <div className={styles.sessionMeta}>{dateTime(session.opened_at)}{session.closed_at ? ` → ${dateTime(session.closed_at)}` : ""}</div>
        {session.status === "closed" ? <div className={styles.sessionMeta}>Esperado {money(session.expected_cash_cents_snapshot)} · Contado {money(session.counted_cash_cents)} · Diferença {money(session.difference_cents)}</div> : null}
      </div>)}</div>
    </details>
  </section>;
}

function Metric({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return <div className={styles.metric} data-primary={primary || undefined}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong></div>;
}
