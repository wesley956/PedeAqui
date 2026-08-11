import {
  createAutomationAction,
  createCampaignAction,
  createCouponAction,
  createSegmentAction,
  prepareCampaignAction,
  runGrowthAutomationsAction,
  saveGrowthSettingsAction,
} from "@/features/growth/actions";
import { GrowthService } from "@/server/growth/growth-service";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function money(cents: unknown) { return currency.format(Number(cents ?? 0) / 100); }
function percent(bps: unknown) { return (Number(bps ?? 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function dateTime(value: unknown) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))) : "—"; }

const fieldStyle: React.CSSProperties = { minHeight: 42, border: "1px solid #ddd6ce", borderRadius: 10, padding: "9px 11px", background: "#fff", color: "#181818", width: "100%" };
const labelStyle: React.CSSProperties = { display: "grid", gap: 5, fontSize: 13, fontWeight: 800 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 };
const buttonStyle: React.CSSProperties = { minHeight: 42, border: 0, borderRadius: 10, padding: "9px 14px", background: "#FF6B00", color: "white", fontWeight: 900, cursor: "pointer" };
const secondaryButton: React.CSSProperties = { ...buttonStyle, background: "#242424" };

export default async function GrowthPage() {
  const data = await GrowthService.loadOverview();
  const settings = data.settings;

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <header>
        <div className="muted" style={{ fontSize: 13 }}>CRM E CRESCIMENTO</div>
        <h1 style={{ margin: "4px 0" }}>Fidelidade, campanhas e recompra</h1>
        <p className="muted" style={{ margin: 0 }}>Benefícios e públicos são calculados no servidor. Canais externos como WhatsApp/e-mail ficam desacoplados desta camada.</p>
      </header>

      <div style={{ ...gridStyle, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <Metric label="Cupons ativos" value={String(data.coupons.filter((item) => item.active).length)} />
        <Metric label="Clientes com saldo" value={String(data.balances.length)} />
        <Metric label="Segmentos" value={String(data.segments.filter((item) => item.active).length)} />
        <Metric label="Campanhas" value={String(data.campaigns.length)} />
        <Metric label="Automações" value={String(data.automationRules.filter((item) => item.active).length)} />
      </div>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div><h2 style={{ margin: 0 }}>Regras de fidelidade</h2><p className="muted" style={{ margin: "5px 0 0" }}>Configuração por unidade. O ganho ocorre somente em pedido concluído.</p></div>
        <form action={saveGrowthSettingsAction} style={{ display: "grid", gap: 12 }}>
          <div style={gridStyle}>
            <label style={labelStyle}><span><input type="checkbox" name="cashbackEnabled" defaultChecked={Boolean(settings?.cashback_enabled)} /> Cashback ativo</span><input style={fieldStyle} name="cashbackRate" inputMode="decimal" defaultValue={percent(settings?.cashback_rate_bps)} placeholder="% por compra" /></label>
            <label style={labelStyle}>Pedido mínimo p/ cashback<input style={fieldStyle} name="cashbackMinOrder" inputMode="decimal" defaultValue={(Number(settings?.cashback_min_order_cents ?? 0) / 100).toFixed(2).replace(".", ",")} /></label>
            <label style={labelStyle}>Validade do cashback (dias)<input style={fieldStyle} name="cashbackExpiryDays" type="number" min={1} max={3650} defaultValue={settings?.cashback_expiry_days ?? ""} /></label>
            <label style={labelStyle}><span><input type="checkbox" name="loyaltyEnabled" defaultChecked={Boolean(settings?.loyalty_enabled)} /> Pontos ativos</span><input style={fieldStyle} name="loyaltySpendPerPoint" inputMode="decimal" defaultValue={(Number(settings?.loyalty_spend_cents_per_point ?? 100) / 100).toFixed(2).replace(".", ",")} placeholder="R$ por ponto" /></label>
            <label style={labelStyle}>Valor do ponto no resgate<input style={fieldStyle} name="loyaltyRedeemPerPoint" inputMode="decimal" defaultValue={(Number(settings?.loyalty_redeem_cents_per_point ?? 1) / 100).toFixed(2).replace(".", ",")} /></label>
          </div>
          <div><button style={buttonStyle} type="submit">Salvar regras</button></div>
        </form>
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>Novo cupom</h2>
        <form action={createCouponAction} style={{ display: "grid", gap: 10 }}>
          <div style={gridStyle}>
            <label style={labelStyle}>Código<input style={fieldStyle} name="code" required maxLength={40} placeholder="VOLTA20" /></label>
            <label style={labelStyle}>Nome<input style={fieldStyle} name="name" required maxLength={120} placeholder="Cupom de recompra" /></label>
            <label style={labelStyle}>Tipo<select style={fieldStyle} name="discountType" defaultValue="percentage"><option value="percentage">Percentual</option><option value="fixed">Valor fixo</option></select></label>
            <label style={labelStyle}>Desconto<input style={fieldStyle} name="discountValue" inputMode="decimal" required placeholder="20 ou 10,00" /></label>
            <label style={labelStyle}>Desconto máximo<input style={fieldStyle} name="maxDiscount" inputMode="decimal" placeholder="Opcional" /></label>
            <label style={labelStyle}>Pedido mínimo<input style={fieldStyle} name="minimumOrder" inputMode="decimal" defaultValue="0,00" /></label>
            <label style={labelStyle}>Limite total<input style={fieldStyle} name="usageLimitTotal" type="number" min={1} placeholder="Sem limite" /></label>
            <label style={labelStyle}>Limite por cliente<input style={fieldStyle} name="usageLimitPerCustomer" type="number" min={1} placeholder="Sem limite" /></label>
            <label style={labelStyle}>Validade<input style={fieldStyle} name="validUntil" type="datetime-local" /></label>
          </div>
          <div><button style={buttonStyle} type="submit">Criar cupom</button></div>
        </form>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}><thead><tr><Th>Código</Th><Th>Regra</Th><Th>Mínimo</Th><Th>Uso</Th><Th>Validade</Th></tr></thead><tbody>{data.coupons.map((coupon) => <tr key={coupon.id}><Td><strong>{coupon.code}</strong><div className="muted">{coupon.name}</div></Td><Td>{coupon.discount_type === "fixed" ? money(coupon.fixed_discount_cents) : `${percent(coupon.percentage_bps)}%${coupon.max_discount_cents ? ` · máx. ${money(coupon.max_discount_cents)}` : ""}`}</Td><Td>{money(coupon.minimum_order_cents)}</Td><Td>{coupon.usage_limit_total ?? "∞"} total · {coupon.usage_limit_per_customer ?? "∞"} / cliente</Td><Td>{coupon.valid_until ? dateTime(coupon.valid_until) : "Sem expiração"}</Td></tr>)}</tbody></table></div>
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>Saldos de clientes</h2>
        {data.balances.length === 0 ? <div className="muted">Ainda não há saldos de cashback ou pontos nesta unidade.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>{data.balances.slice(0, 24).map((item) => <div key={item.customerId} style={{ border: "1px solid #e7e0d9", borderRadius: 14, padding: 13 }}><strong>{item.name}</strong><div className="muted" style={{ fontSize: 12 }}>{item.phone ?? "Sem telefone"}</div><div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 9 }}><span>Cashback <strong>{money(item.cashbackBalanceCents)}</strong></span><span>Pontos <strong>{item.loyaltyBalancePoints}</strong></span></div></div>)}</div>}
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>Segmentação dinâmica</h2>
        <form action={createSegmentAction} style={{ display: "grid", gap: 10 }}>
          <div style={gridStyle}>
            <label style={labelStyle}>Nome<input style={fieldStyle} name="name" required placeholder="Clientes VIP" /></label>
            <label style={labelStyle}>Pedidos mínimos<input style={fieldStyle} name="ordersCountMin" type="number" min={1} /></label>
            <label style={labelStyle}>Gasto mínimo<input style={fieldStyle} name="totalSpentMin" inputMode="decimal" /></label>
            <label style={labelStyle}>Ticket médio mínimo<input style={fieldStyle} name="averageTicketMin" inputMode="decimal" /></label>
            <label style={labelStyle}>Inativo há pelo menos<input style={fieldStyle} name="inactiveDaysMin" type="number" min={1} placeholder="dias" /></label>
            <label style={labelStyle}>Comprou nos últimos<input style={fieldStyle} name="lastOrderDaysMax" type="number" min={1} placeholder="dias" /></label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}><label><input type="checkbox" name="hasCashbackBalance" /> Com cashback</label><label><input type="checkbox" name="hasLoyaltyBalance" /> Com pontos</label></div>
          <label style={labelStyle}>Descrição<input style={fieldStyle} name="description" maxLength={500} /></label>
          <div><button style={buttonStyle} type="submit">Criar segmento</button></div>
        </form>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{data.segments.map((segment) => <span key={segment.id} style={{ padding: "8px 11px", borderRadius: 999, border: "1px solid #ded7d0", background: segment.active ? "#fff4eb" : "#f4f4f4" }}><strong>{segment.name}</strong> <span className="muted" style={{ fontSize: 12 }}>{JSON.stringify(segment.rules)}</span></span>)}</div>
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>Campanhas</h2>
        <form action={createCampaignAction} style={{ display: "grid", gap: 10 }}>
          <div style={gridStyle}>
            <label style={labelStyle}>Nome<input style={fieldStyle} name="name" required /></label>
            <label style={labelStyle}>Objetivo<input style={fieldStyle} name="objective" /></label>
            <label style={labelStyle}>Canal<select style={fieldStyle} name="channel"><option value="internal">Interno</option><option value="whatsapp">WhatsApp (adaptador futuro)</option><option value="email">E-mail (adaptador futuro)</option></select></label>
            <label style={labelStyle}>Segmento<select style={fieldStyle} name="segmentId"><option value="">Todos os clientes</option>{data.segments.filter((item) => item.active).map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label>
          </div>
          <label style={labelStyle}>Conteúdo<textarea style={{ ...fieldStyle, minHeight: 86 }} name="content" maxLength={4000} /></label>
          <div><button style={buttonStyle} type="submit">Criar campanha</button></div>
        </form>
        <div style={{ display: "grid", gap: 9 }}>{data.campaigns.map((campaign) => <div key={campaign.id} style={{ border: "1px solid #e7e0d9", borderRadius: 14, padding: 13, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "center" }}><div><strong>{campaign.name}</strong><div className="muted" style={{ fontSize: 12 }}>{campaign.channel} · {campaign.status} · criado {dateTime(campaign.created_at)}</div></div>{!(["completed", "canceled"] as string[]).includes(campaign.status) ? <form action={prepareCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><button style={secondaryButton} type="submit">Preparar público</button></form> : null}</div>)}</div>
      </section>

      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}><div><h2 style={{ margin: 0 }}>Automações</h2><p className="muted" style={{ margin: "4px 0 0" }}>Pedido concluído roda automaticamente; aniversário/inatividade podem ser processados pelo executor diário.</p></div><form action={runGrowthAutomationsAction}><button style={secondaryButton} type="submit">Executar rotinas de hoje</button></form></div>
        <form action={createAutomationAction} style={{ display: "grid", gap: 10 }}>
          <div style={gridStyle}>
            <label style={labelStyle}>Nome<input style={fieldStyle} name="name" required /></label>
            <label style={labelStyle}>Gatilho<select style={fieldStyle} name="triggerType"><option value="order.completed">Pedido concluído</option><option value="customer.inactive">Cliente inativo</option><option value="customer.birthday">Aniversário</option></select></label>
            <label style={labelStyle}>Ação<select style={fieldStyle} name="actionType"><option value="bonus_cashback">Cashback bônus</option><option value="bonus_points">Pontos bônus</option><option value="campaign">Adicionar à campanha</option></select></label>
            <label style={labelStyle}>Pedido mínimo<input style={fieldStyle} name="minimumTotal" inputMode="decimal" /></label>
            <label style={labelStyle}>Inatividade (dias)<input style={fieldStyle} name="inactiveDays" type="number" min={1} /></label>
            <label style={labelStyle}>Canal do pedido<input style={fieldStyle} name="orderChannel" placeholder="digital_menu / pdv" /></label>
            <label style={labelStyle}>Cashback bônus<input style={fieldStyle} name="bonusCashback" inputMode="decimal" /></label>
            <label style={labelStyle}>Pontos bônus<input style={fieldStyle} name="bonusPoints" type="number" min={1} /></label>
            <label style={labelStyle}>Campanha<select style={fieldStyle} name="campaignId"><option value="">—</option>{data.campaigns.filter((item) => !["completed", "canceled"].includes(item.status)).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          </div>
          <div><button style={buttonStyle} type="submit">Criar automação</button></div>
        </form>
        <div style={{ display: "grid", gap: 8 }}>{data.automationRules.map((rule) => <div key={rule.id} style={{ border: "1px solid #e7e0d9", borderRadius: 12, padding: 12 }}><strong>{rule.name}</strong><div className="muted" style={{ fontSize: 12 }}>{rule.trigger_type} → {rule.action_type} · {rule.active ? "ativa" : "inativa"}</div></div>)}</div>
        {data.automationRuns.length > 0 ? <div><h3>Execuções recentes</h3><div style={{ display: "grid", gap: 6 }}>{data.automationRuns.slice(0, 15).map((run) => <div key={run.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee7df", fontSize: 13 }}><span>{dateTime(run.started_at)}</span><strong>{run.status}</strong></div>)}</div></div> : null}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card" style={{ padding: 14 }}><div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ fontWeight: 950, fontSize: 24, marginTop: 3 }}>{value}</div></div>;
}
function Th({ children }: { children: React.ReactNode }) { return <th style={{ textAlign: "left", padding: "9px 8px", borderBottom: "1px solid #ded7d0", fontSize: 12 }}>{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td style={{ padding: "10px 8px", borderBottom: "1px solid #eee7df", verticalAlign: "top", fontSize: 13 }}>{children}</td>; }
