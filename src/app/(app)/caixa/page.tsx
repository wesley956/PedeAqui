import {
  cashMovementAction,
  closeCashSessionAction,
  createCashRegisterAction,
  openCashSessionAction,
  updateCashRegisterAction,
} from "@/features/cash/actions";
import { cashMovementLabels, type CashMovementType } from "@/features/cash/model";
import { CashService } from "@/server/cash/cash-service";

function money(value: unknown) {
  const cents = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function dateTime(value: unknown) {
  return typeof value === "string" ? new Date(value).toLocaleString("pt-BR") : "—";
}

const inputStyle: React.CSSProperties = {
  minHeight: 42, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "9px 11px",
};
const buttonStyle: React.CSSProperties = {
  minHeight: 42, border: 0, borderRadius: 10, background: "var(--accent)", color: "#fff", padding: "9px 13px", fontWeight: 800, cursor: "pointer",
};
const secondaryButton: React.CSSProperties = { ...buttonStyle, background: "var(--surface-2)", border: "1px solid var(--border)" };
const dangerButton: React.CSSProperties = { ...buttonStyle, background: "#b42318" };

export default async function CashPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const notice = await searchParams;
  const data = await CashService.loadDashboard();
  const { registers, sessions, currentSession, movements, abilities } = data;
  const summary = data.summary as { expected_cash_cents?: number; totals?: Record<string, number> } | null;
  const totals = summary?.totals ?? {};
  const openByRegister = new Map(sessions.filter((session) => session.status === "open").map((session) => [session.cash_register_id, session]));
  const freeRegisters = registers.filter((register) => register.active && !openByRegister.has(register.id));

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1280 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Operação de dinheiro físico</p>
          <h1 style={{ margin: "4px 0" }}>Caixa</h1>
          <p className="muted" style={{ margin: 0 }}>Abertura, vendas em dinheiro, suprimentos, sangrias e conferência em um ledger imutável.</p>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Pagamento continua sendo o ledger financeiro; Caixa controla o dinheiro físico do turno.</div>
      </header>

      {notice.ok ? <div className="card" style={{ padding: 12, borderColor: "#22c55e" }}>{notice.ok}</div> : null}
      {notice.error ? <div className="card" style={{ padding: 12, borderColor: "#f97066", color: "#fda29b" }}>{notice.error}</div> : null}

      {currentSession ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <Metric label="Caixa" value={currentSession.register?.name ?? "Caixa"} />
            <Metric label="Aberto em" value={dateTime(currentSession.opened_at)} />
            <Metric label="Saldo esperado" value={money(summary?.expected_cash_cents)} accent />
            <Metric label="Vendas em dinheiro" value={money(totals.sales_cents)} />
            <Metric label="Suprimentos" value={money(totals.supplies_cents)} />
            <Metric label="Sangrias" value={money(totals.withdrawals_cents)} />
            <Metric label="Estornos" value={money(totals.refunds_cents)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14, alignItems: "start" }}>
            {abilities.supply ? (
              <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>Suprimento</h2>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>Entrada manual de dinheiro no caixa.</p>
                <form action={cashMovementAction.bind(null, "supply", currentSession.id)} style={{ display: "grid", gap: 8 }}>
                  <input name="amount" required inputMode="decimal" placeholder="Valor, ex.: 100,00" style={inputStyle} />
                  <input name="reason" required minLength={3} maxLength={500} placeholder="Motivo do suprimento" style={inputStyle} />
                  <button type="submit" style={buttonStyle}>Registrar suprimento</button>
                </form>
              </article>
            ) : null}

            {abilities.withdraw ? (
              <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>Sangria</h2>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>Saída auditada; o banco bloqueia valor acima do saldo esperado.</p>
                <form action={cashMovementAction.bind(null, "withdrawal", currentSession.id)} style={{ display: "grid", gap: 8 }}>
                  <input name="amount" required inputMode="decimal" placeholder="Valor, ex.: 200,00" style={inputStyle} />
                  <input name="reason" required minLength={3} maxLength={500} placeholder="Motivo da sangria" style={inputStyle} />
                  <button type="submit" style={dangerButton}>Registrar sangria</button>
                </form>
              </article>
            ) : null}

            {abilities.close ? (
              <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>Fechar e conferir</h2>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>Conte o dinheiro físico. A diferença é calculada contra o saldo esperado no PostgreSQL.</p>
                <form action={closeCashSessionAction.bind(null, currentSession.id)} style={{ display: "grid", gap: 8 }}>
                  <input name="countedCash" required inputMode="decimal" placeholder="Dinheiro contado" style={inputStyle} />
                  <input name="note" maxLength={500} placeholder="Observação opcional" style={inputStyle} />
                  <button type="submit" style={dangerButton}>Conferir e fechar turno</button>
                </form>
              </article>
            ) : null}
          </div>

          <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17 }}>Movimentos deste turno</h2>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>O histórico é somente leitura. Correções financeiras entram como movimentos compensatórios.</p>
            </div>
            {movements.length === 0 ? <p className="muted">Nenhum movimento ainda.</p> : movements.map((raw) => {
              const movement = raw as Record<string, unknown>;
              const type = String(movement.movement_type) as CashMovementType;
              const outgoing = movement.direction === "out";
              return (
                <div key={String(movement.id)} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderTop: "1px solid var(--border)", alignItems: "center" }}>
                  <div>
                    <strong>{cashMovementLabels[type] ?? type}</strong>
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{dateTime(movement.created_at)}{movement.reason ? ` · ${String(movement.reason)}` : ""}</div>
                  </div>
                  <strong style={{ color: outgoing ? "#f97066" : "#22c55e" }}>{outgoing ? "−" : "+"}{money(movement.amount_cents)}</strong>
                </div>
              );
            })}
          </article>
        </>
      ) : (
        <article className="card" style={{ padding: 18, display: "grid", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Abrir turno</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>Você precisa de uma sessão aberta para confirmar vendas em dinheiro.</p>
          </div>
          {abilities.open && freeRegisters.length > 0 ? (
            <form action={openCashSessionAction} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 9, alignItems: "end" }}>
              <label style={{ display: "grid", gap: 5 }}><span className="muted" style={{ fontSize: 11 }}>CAIXA</span><select name="cashRegisterId" required style={inputStyle}>{freeRegisters.map((register) => <option key={register.id} value={register.id}>{register.code} · {register.name}</option>)}</select></label>
              <label style={{ display: "grid", gap: 5 }}><span className="muted" style={{ fontSize: 11 }}>SALDO INICIAL</span><input name="openingBalance" inputMode="decimal" defaultValue="0,00" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 5 }}><span className="muted" style={{ fontSize: 11 }}>OBSERVAÇÃO</span><input name="note" maxLength={500} placeholder="Opcional" style={inputStyle} /></label>
              <button type="submit" style={buttonStyle}>Abrir caixa</button>
            </form>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{freeRegisters.length === 0 ? "Não há caixa ativo e livre. Crie um novo caixa ou aguarde o encerramento de outro turno." : "Seu perfil não possui permissão para abrir caixa."}</p>
          )}
        </article>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, .65fr)", gap: 14, alignItems: "start" }}>
        <article className="card" style={{ padding: 16, display: "grid", gap: 10, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Caixas da unidade</h2>
          {registers.length === 0 ? <p className="muted">Nenhum caixa configurado.</p> : registers.map((register) => {
            const open = openByRegister.get(register.id);
            return (
              <div key={register.id} style={{ display: "grid", gap: 7, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div><strong>{register.code} · {register.name}</strong><div className="muted" style={{ fontSize: 11 }}>{register.active ? "Ativo" : "Desativado"}{open ? " · turno aberto" : " · livre"}</div></div>
                </div>
                {abilities.manage ? (
                  <form action={updateCashRegisterAction.bind(null, register.id)} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) auto auto", gap: 8, alignItems: "center" }}>
                    <input name="name" defaultValue={register.name} required maxLength={80} style={inputStyle} />
                    <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}><input type="checkbox" name="active" defaultChecked={register.active} /> Ativo</label>
                    <button type="submit" style={secondaryButton}>Salvar</button>
                  </form>
                ) : null}
              </div>
            );
          })}
          {abilities.manage ? (
            <form action={createCashRegisterAction} style={{ display: "grid", gridTemplateColumns: "minmax(120px, .4fr) minmax(180px, 1fr) auto", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <input name="code" required maxLength={32} placeholder="Código" style={inputStyle} />
              <input name="name" required maxLength={80} placeholder="Nome do caixa" style={inputStyle} />
              <button type="submit" style={buttonStyle}>Criar caixa</button>
            </form>
          ) : null}
        </article>

        <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Histórico de turnos</h2>
          {sessions.length === 0 ? <p className="muted">Nenhum turno registrado.</p> : sessions.slice(0, 15).map((session) => (
            <div key={session.id} style={{ padding: "9px 0", borderTop: "1px solid var(--border)" }}>
              <strong>{session.register?.name ?? "Caixa"} · {session.status === "open" ? "Aberto" : "Fechado"}</strong>
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{dateTime(session.opened_at)}{session.closed_at ? ` → ${dateTime(session.closed_at)}` : ""}</div>
              {session.status === "closed" ? <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Esperado {money(session.expected_cash_cents_snapshot)} · Contado {money(session.counted_cash_cents)} · Diferença {money(session.difference_cents)}</div> : null}
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 10 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 4, color: accent ? "var(--accent)" : undefined, fontSize: accent ? 20 : 15 }}>{value}</strong></div>;
}
