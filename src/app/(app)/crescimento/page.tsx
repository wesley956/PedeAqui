import Link from "next/link";
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
import styles from "./growth.module.css";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function money(cents: unknown) { return currency.format(Number(cents ?? 0) / 100); }
function percent(bps: unknown) { return (Number(bps ?? 0) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }); }
function dateTime(value: unknown) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))) : "—"; }

function segmentSummary(value: unknown) {
  if (!value || typeof value !== "object") return "Público personalizado";
  const rules = value as Record<string, unknown>;
  const labels: string[] = [];
  if (Number(rules.orders_count_min) > 0) labels.push(`${Number(rules.orders_count_min)}+ pedidos`);
  if (Number(rules.total_spent_cents_min) > 0) labels.push(`gastou ${money(rules.total_spent_cents_min)} ou mais`);
  if (Number(rules.average_ticket_cents_min) > 0) labels.push(`ticket médio de ${money(rules.average_ticket_cents_min)} ou mais`);
  if (Number(rules.inactive_days_min) > 0) labels.push(`inativo há ${Number(rules.inactive_days_min)}+ dias`);
  if (Number(rules.last_order_days_max) > 0) labels.push(`comprou nos últimos ${Number(rules.last_order_days_max)} dias`);
  if (rules.has_cashback_balance === true) labels.push("tem cashback");
  if (rules.has_loyalty_balance === true) labels.push("tem pontos");
  return labels.length > 0 ? labels.join(" · ") : "Público personalizado";
}

const campaignStatusLabels: Record<string, string> = {
  draft: "Rascunho", prepared: "Público preparado", queued: "Agendada", running: "Em andamento",
  sending: "Em envio", completed: "Finalizada", canceled: "Cancelada", failed: "Precisa de atenção",
};
const triggerLabels: Record<string, string> = { "order.completed": "Pedido concluído", "customer.inactive": "Cliente inativo", "customer.birthday": "Aniversário" };
const actionLabels: Record<string, string> = { bonus_cashback: "Cashback bônus", bonus_points: "Pontos bônus", campaign: "Adicionar à campanha" };
const runStatusLabels: Record<string, string> = { pending: "Aguardando", running: "Em andamento", completed: "Concluída", success: "Concluída", failed: "Precisa de atenção", skipped: "Não necessária" };

export default async function GrowthPage() {
  const data = await GrowthService.loadOverview();
  const settings = data.settings;
  const activeCoupons = data.coupons.filter((item) => item.active).length;
  const activeSegments = data.segments.filter((item) => item.active).length;
  const activeAutomations = data.automationRules.filter((item) => item.active).length;
  const activeCampaigns = data.campaigns.filter((item) => !["completed", "canceled"].includes(item.status)).length;

  return (
    <main className={styles.root}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CRESCIMENTO</p>
          <h1>Faça seus clientes voltarem</h1>
          <p>Organize fidelidade, cupons, públicos e campanhas em um só lugar, com foco no que ajuda o restaurante a gerar novas compras.</p>
        </div>
      </header>

      <section className={styles.objectives} aria-labelledby="growth-next-action">
        <div className={styles.objectivesHeader}><h2 id="growth-next-action">O que você quer fazer agora?</h2><p>Escolha um objetivo; as configurações avançadas continuam disponíveis abaixo.</p></div>
        <div className={styles.objectiveGrid}>
          <a className={styles.objectiveCard} href="#fidelidade"><strong>Fidelizar clientes</strong><span>Configure cashback ou pontos para premiar novas compras.</span><b>Configurar fidelidade →</b></a>
          <a className={styles.objectiveCard} href="#campanhas"><strong>Trazer clientes de volta</strong><span>Crie uma campanha para todos ou para um grupo específico.</span><b>Criar campanha →</b></a>
          <Link className={styles.objectiveCard} href="/crescimento/campanhas"><strong>Acompanhar e enviar</strong><span>Prepare o público e acompanhe os envios autorizados pelo WhatsApp.</span><b>Abrir campanhas →</b></Link>
        </div>
      </section>

      <section className={styles.metrics} aria-label="Resumo de crescimento">
        <Metric label="Cupons ativos" value={String(activeCoupons)} />
        <Metric label="Clientes com saldo" value={String(data.balances.length)} />
        <Metric label="Grupos ativos" value={String(activeSegments)} />
        <Metric label="Campanhas ativas" value={String(activeCampaigns)} />
        <Metric label="Automações ativas" value={String(activeAutomations)} />
      </section>

      <nav className={styles.nav} aria-label="Áreas de crescimento">
        <a href="#fidelidade">Fidelidade</a><a href="#cupons">Cupons</a><a href="#clientes">Clientes</a><a href="#campanhas">Campanhas</a><Link href="/crescimento/campanhas">Envio WhatsApp</Link><a href="#automacoes">Automações</a>
      </nav>

      <section id="fidelidade" className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Fidelidade</h2><p>Defina como cashback e pontos recompensam novas compras.</p></div></div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}><span className={styles.status} data-active={Boolean(settings?.cashback_enabled)}>Cashback {settings?.cashback_enabled ? "ativo" : "desativado"}</span><strong>{settings?.cashback_enabled ? `${percent(settings.cashback_rate_bps)}% por compra` : "Configure quando quiser"}</strong><small>{Number(settings?.cashback_min_order_cents ?? 0) > 0 ? `A partir de ${money(settings?.cashback_min_order_cents)}` : "Sem pedido mínimo configurado"}</small></article>
          <article className={styles.summaryCard}><span className={styles.status} data-active={Boolean(settings?.loyalty_enabled)}>Pontos {settings?.loyalty_enabled ? "ativos" : "desativados"}</span><strong>{settings?.loyalty_enabled ? `1 ponto a cada ${money(settings?.loyalty_spend_cents_per_point ?? 100)}` : "Configure quando quiser"}</strong><small>{settings?.loyalty_enabled ? `Cada ponto vale ${money(settings?.loyalty_redeem_cents_per_point ?? 1)} no resgate` : "Uma alternativa simples para premiar frequência"}</small></article>
        </div>
        <details className={styles.details}><summary>Editar regras de fidelidade</summary><form action={saveGrowthSettingsAction} className={styles.detailsBody}><div className={styles.formGrid}>
          <label className={styles.label}><span><input type="checkbox" name="cashbackEnabled" defaultChecked={Boolean(settings?.cashback_enabled)} /> Cashback ativo</span><input className={styles.field} name="cashbackRate" inputMode="decimal" defaultValue={percent(settings?.cashback_rate_bps)} placeholder="% por compra" /></label>
          <label className={styles.label}>Pedido mínimo para cashback<input className={styles.field} name="cashbackMinOrder" inputMode="decimal" defaultValue={(Number(settings?.cashback_min_order_cents ?? 0) / 100).toFixed(2).replace(".", ",")} /></label>
          <label className={styles.label}>Validade do cashback (dias)<input className={styles.field} name="cashbackExpiryDays" type="number" min={1} max={3650} defaultValue={settings?.cashback_expiry_days ?? ""} /></label>
          <label className={styles.label}><span><input type="checkbox" name="loyaltyEnabled" defaultChecked={Boolean(settings?.loyalty_enabled)} /> Pontos ativos</span><input className={styles.field} name="loyaltySpendPerPoint" inputMode="decimal" defaultValue={(Number(settings?.loyalty_spend_cents_per_point ?? 100) / 100).toFixed(2).replace(".", ",")} placeholder="R$ por ponto" /></label>
          <label className={styles.label}>Valor do ponto no resgate<input className={styles.field} name="loyaltyRedeemPerPoint" inputMode="decimal" defaultValue={(Number(settings?.loyalty_redeem_cents_per_point ?? 1) / 100).toFixed(2).replace(".", ",")} /></label>
        </div><div><button className={styles.primary} type="submit">Salvar regras</button></div></form></details>
      </section>

      <section id="cupons" className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Cupons</h2><p>Crie incentivos de recompra sem deixar o formulário ocupando a tela o tempo todo.</p></div><span className={styles.status} data-active="true">{activeCoupons} ativo(s)</span></div>
        <details className={styles.details}><summary>Criar novo cupom</summary><form action={createCouponAction} className={styles.detailsBody}><div className={styles.formGrid}>
          <label className={styles.label}>Código<input className={styles.field} name="code" required maxLength={40} placeholder="VOLTA20" /></label><label className={styles.label}>Nome<input className={styles.field} name="name" required maxLength={120} placeholder="Cupom de recompra" /></label><label className={styles.label}>Tipo<select className={styles.field} name="discountType" defaultValue="percentage"><option value="percentage">Percentual</option><option value="fixed">Valor fixo</option></select></label><label className={styles.label}>Desconto<input className={styles.field} name="discountValue" inputMode="decimal" required placeholder="20 ou 10,00" /></label><label className={styles.label}>Desconto máximo<input className={styles.field} name="maxDiscount" inputMode="decimal" placeholder="Opcional" /></label><label className={styles.label}>Pedido mínimo<input className={styles.field} name="minimumOrder" inputMode="decimal" defaultValue="0,00" /></label><label className={styles.label}>Limite total<input className={styles.field} name="usageLimitTotal" type="number" min={1} placeholder="Sem limite" /></label><label className={styles.label}>Limite por cliente<input className={styles.field} name="usageLimitPerCustomer" type="number" min={1} placeholder="Sem limite" /></label><label className={styles.label}>Validade<input className={styles.field} name="validUntil" type="datetime-local" /></label>
        </div><div><button className={styles.primary} type="submit">Criar cupom</button></div></form></details>
        <div className={styles.list}>{data.coupons.map((coupon) => <article key={coupon.id} className={styles.item}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{coupon.code}</strong><span className={styles.status} data-active={coupon.active}>{coupon.active ? "Ativo" : "Inativo"}</span></div><span className={styles.itemMeta}>{coupon.name} · {coupon.discount_type === "fixed" ? money(coupon.fixed_discount_cents) : `${percent(coupon.percentage_bps)}%${coupon.max_discount_cents ? `, até ${money(coupon.max_discount_cents)}` : ""}`} · mínimo {money(coupon.minimum_order_cents)}</span><span className={styles.itemMeta}>{coupon.usage_limit_total ?? "Sem limite"} usos no total · {coupon.usage_limit_per_customer ?? "Sem limite"} por cliente · {coupon.valid_until ? `até ${dateTime(coupon.valid_until)}` : "sem expiração"}</span></div></article>)}{data.coupons.length === 0 ? <div className={styles.empty}>Nenhum cupom criado ainda. Abra “Criar novo cupom” para começar.</div> : null}</div>
      </section>

      <section id="clientes" className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Clientes e públicos</h2><p>Veja quem já possui benefícios e monte grupos para campanhas mais relevantes.</p></div></div>
        <div className={styles.customerGrid}>{data.balances.slice(0, 24).map((item) => <article key={item.customerId} className={styles.customer}><strong>{item.name}</strong><small>{item.phone ?? "Sem telefone"}</small><div className={styles.balances}><span>Cashback<strong>{money(item.cashbackBalanceCents)}</strong></span><span>Pontos<strong>{item.loyaltyBalancePoints}</strong></span></div></article>)}{data.balances.length === 0 ? <div className={styles.empty}>Os saldos de cashback e pontos aparecerão aqui conforme os clientes utilizarem o programa.</div> : null}</div>
        <div className={styles.chips}>{data.segments.map((segment) => <span key={segment.id} className={styles.chip}><strong>{segment.name}</strong>{segmentSummary(segment.rules)}</span>)}</div>
        <details className={styles.details}><summary>Criar grupo de clientes</summary><form action={createSegmentAction} className={styles.detailsBody}><div className={styles.formGrid}><label className={styles.label}>Nome<input className={styles.field} name="name" required placeholder="Clientes VIP" /></label><label className={styles.label}>Pedidos mínimos<input className={styles.field} name="ordersCountMin" type="number" min={1} /></label><label className={styles.label}>Gasto mínimo<input className={styles.field} name="totalSpentMin" inputMode="decimal" /></label><label className={styles.label}>Ticket médio mínimo<input className={styles.field} name="averageTicketMin" inputMode="decimal" /></label><label className={styles.label}>Inativo há pelo menos<input className={styles.field} name="inactiveDaysMin" type="number" min={1} placeholder="dias" /></label><label className={styles.label}>Comprou nos últimos<input className={styles.field} name="lastOrderDaysMax" type="number" min={1} placeholder="dias" /></label></div><div className={styles.checks}><label><input type="checkbox" name="hasCashbackBalance" /> Com cashback</label><label><input type="checkbox" name="hasLoyaltyBalance" /> Com pontos</label></div><label className={styles.label}>Descrição<input className={styles.field} name="description" maxLength={500} /></label><div><button className={styles.primary} type="submit">Criar grupo</button></div></form></details>
      </section>

      <section id="campanhas" className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Campanhas</h2><p>Prepare ações para todos os clientes ou para um grupo específico.</p></div><span className={styles.status} data-active="true">{activeCampaigns} em andamento</span></div>
        <details className={styles.details}><summary>Criar campanha</summary><form action={createCampaignAction} className={styles.detailsBody}><input type="hidden" name="channel" value="internal" /><div className={styles.formGrid}><label className={styles.label}>Nome<input className={styles.field} name="name" required /></label><label className={styles.label}>Objetivo<input className={styles.field} name="objective" /></label><label className={styles.label}>Público<select className={styles.field} name="segmentId"><option value="">Todos os clientes</option>{data.segments.filter((item) => item.active).map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</select></label></div><label className={styles.label}>Conteúdo<textarea className={`${styles.field} ${styles.textarea}`} name="content" maxLength={4000} /></label><div><button className={styles.primary} type="submit">Criar campanha</button></div></form></details>
        <div className={styles.list}>{data.campaigns.map((campaign) => <article key={campaign.id} className={styles.item}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{campaign.name}</strong><span className={styles.status} data-active={!['completed','canceled'].includes(campaign.status)}>{campaignStatusLabels[campaign.status] ?? "Em preparação"}</span></div><span className={styles.itemMeta}>{campaign.objective || "Sem objetivo informado"} · criada em {dateTime(campaign.created_at)}</span></div>{!(["completed", "canceled"] as string[]).includes(campaign.status) ? <form action={prepareCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><button className={styles.secondary} type="submit">Preparar público</button></form> : null}</article>)}{data.campaigns.length === 0 ? <div className={styles.empty}>Nenhuma campanha criada ainda.</div> : null}</div>
      </section>

      <section id="automacoes" className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Automações</h2><p>Configure benefícios ou campanhas que acontecem quando determinadas situações ocorrerem.</p></div><form action={runGrowthAutomationsAction}><button className={styles.secondary} type="submit">Verificar ações de hoje</button></form></div>
        <details className={styles.details}><summary>Criar automação</summary><form action={createAutomationAction} className={styles.detailsBody}><div className={styles.formGrid}><label className={styles.label}>Nome<input className={styles.field} name="name" required /></label><label className={styles.label}>Quando<select className={styles.field} name="triggerType"><option value="order.completed">Pedido concluído</option><option value="customer.inactive">Cliente inativo</option><option value="customer.birthday">Aniversário</option></select></label><label className={styles.label}>O que fazer<select className={styles.field} name="actionType"><option value="bonus_cashback">Dar cashback bônus</option><option value="bonus_points">Dar pontos bônus</option><option value="campaign">Adicionar à campanha</option></select></label><label className={styles.label}>Pedido mínimo<input className={styles.field} name="minimumTotal" inputMode="decimal" /></label><label className={styles.label}>Inatividade (dias)<input className={styles.field} name="inactiveDays" type="number" min={1} /></label><label className={styles.label}>Origem do pedido<select className={styles.field} name="orderChannel" defaultValue=""><option value="">Qualquer origem</option><option value="digital_menu">Cardápio digital</option><option value="pdv">PDV</option><option value="counter">Balcão</option><option value="waiter">Garçom</option><option value="table_qr">QR da mesa</option><option value="manual">Pedido manual</option></select></label><label className={styles.label}>Cashback bônus<input className={styles.field} name="bonusCashback" inputMode="decimal" /></label><label className={styles.label}>Pontos bônus<input className={styles.field} name="bonusPoints" type="number" min={1} /></label><label className={styles.label}>Campanha<select className={styles.field} name="campaignId"><option value="">—</option>{data.campaigns.filter((item) => !["completed", "canceled"].includes(item.status)).map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label></div><div><button className={styles.primary} type="submit">Criar automação</button></div></form></details>
        <div className={styles.list}>{data.automationRules.map((rule) => <article key={rule.id} className={styles.item}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{rule.name}</strong><span className={styles.status} data-active={rule.active}>{rule.active ? "Ativa" : "Inativa"}</span></div><span className={styles.itemMeta}>{triggerLabels[rule.trigger_type] ?? "Evento configurado"} → {actionLabels[rule.action_type] ?? "Ação configurada"}</span></div></article>)}{data.automationRules.length === 0 ? <div className={styles.empty}>Nenhuma automação criada ainda.</div> : null}</div>
        {data.automationRuns.length > 0 ? <div><h3>Atividades recentes</h3><div className={styles.activity}>{data.automationRuns.slice(0, 12).map((run) => <div key={run.id} className={styles.activityRow}><span>{dateTime(run.started_at)}</span><strong>{runStatusLabels[run.status] ?? "Processada"}</strong></div>)}</div></div> : null}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }
