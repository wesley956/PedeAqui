import Link from "next/link";
import { cancelCampaignAction, createCampaignAction, enqueueCampaignAction, pauseCampaignAction, saveCampaignPolicyAction, setMarketingPreferenceAction, updateCampaignContentAction } from "@/features/growth/actions";
import { GrowthService } from "@/server/growth/growth-service";
import styles from "../growth.module.css";

const statusLabels: Record<string, string> = { draft: "Rascunho", scheduled: "Agendada", running: "Em envio", completed: "Concluída", partially_failed: "Concluída com falhas", canceled: "Cancelada" };
const operationLabels: Record<string, string> = {
  "campaign.worker": "Envio de campanhas", "campaign.scheduler": "Agendamento", "conversation.auto_close": "Encerramento de conversas",
  "bot.intent": "Atendimento do robô", "order.notification": "Avisos de pedido",
};
const reasonLabels: Record<string, string> = {
  active_human_conversation: "atendimento humano em andamento", active_order: "pedido em andamento", whatsapp_order_active: "pedido pelo WhatsApp em andamento",
  daily_limit: "limite diário", weekly_limit: "limite semanal", minimum_interval: "intervalo mínimo", channel_unavailable: "WhatsApp indisponível",
  template_missing: "template ausente", unknown_intent: "pedido não compreendido", handoff: "transferência para atendente",
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function money(cents: number) { return currency.format(cents / 100); }

export default async function CampaignCenterPage() {
  const data = await GrowthService.loadCampaignCenter();
  const allGroup = data.groupSummaries.find((group) => group.group_key === "preset:all");
  return <main className={styles.root}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>GROWTH · CAMPANHAS</p><h1>Campanhas pelo WhatsApp oficial</h1><p>Envie templates aprovados somente para clientes elegíveis. A fila controla volume, retry, opt-out e isolamento da unidade.</p></div><Link href="/crescimento" className={styles.secondary}>Voltar ao Growth</Link></header>

    <section className={styles.metrics} aria-label="Prontidão de campanhas">
      <Metric label="Elegíveis" value={data.eligibleCustomers} />
      <Metric label="Opt-out" value={data.optedOutCustomers} />
      <Metric label="Sem consentimento" value={data.notConsentedCustomers} />
      <Metric label="Limite por minuto" value={data.ratePerMinute} />
      <Metric label="Canal oficial" value={data.whatsappReady ? "Pronto" : "Revisar"} />
    </section>

    <section className={styles.section} aria-label="Resultados reais dos últimos 30 dias">
      <div className={styles.sectionHeader}><div><h2>Resultados dos últimos 30 dias</h2><p>{data.metrics.methodology}</p></div></div>
      <div className={styles.metrics}>
        <Metric label="Cashback concedido" value={money(data.metrics.benefits.cashback_earned_cents)} />
        <Metric label="Cashback usado" value={money(data.metrics.benefits.cashback_redeemed_cents)} />
        <Metric label="Pontos concedidos" value={data.metrics.benefits.points_earned} />
        <Metric label="Pontos usados" value={data.metrics.benefits.points_redeemed} />
        <Metric label="Automações concluídas" value={data.metrics.automations.completed} />
        <Metric label="Automações puladas/falhas" value={data.metrics.automations.skipped + data.metrics.automations.failed} />
      </div>
      {data.metrics.operations.length > 0 ? <div className={styles.chips} aria-label="Diagnóstico operacional">{data.metrics.operations.slice(0, 12).map((event) => <span className={styles.chip} key={`${event.event_type}:${event.outcome}:${event.reason_code ?? "none"}`}><strong>{operationLabels[event.event_type] ?? event.event_type}</strong>{event.count} · {event.reason_code ? reasonLabels[event.reason_code] ?? event.reason_code : event.outcome}</span>)}</div> : <p className={styles.itemMeta}>Nenhum alerta operacional registrado no período.</p>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Proteção de frequência</h2><p>Esses limites valem por cliente e nunca permitem forçar publicidade durante pedido ou atendimento ativo.</p></div></div>
      <form action={saveCampaignPolicyAction} className={styles.formGrid}>
        <label className={styles.label}>Intervalo mínimo (horas)<input className={styles.field} name="minimumIntervalHours" type="number" min={1} max={168} defaultValue={data.campaignPolicy.minimumIntervalHours} /></label>
        <label className={styles.label}>Máximo por dia<input className={styles.field} name="dailyLimit" type="number" min={1} max={3} defaultValue={data.campaignPolicy.dailyLimit} /></label>
        <label className={styles.label}>Máximo por semana<input className={styles.field} name="weeklyLimit" type="number" min={1} max={10} defaultValue={data.campaignPolicy.weeklyLimit} /></label>
        <button className={styles.secondary} type="submit">Salvar proteção</button>
      </form>
    </section>

    {!data.enabled ? <section className={styles.section}><div className={styles.empty}><strong>Campanhas estão desligadas para esta loja.</strong><p>O super admin precisa habilitar Growth + Clientes + Conversas e depois a subconfiguração de campanhas.</p></div></section> : null}
    {data.enabled && !data.whatsappReady ? <section className={styles.section}><div className={styles.empty}><strong>Conecte o WhatsApp oficial antes de enviar.</strong><p>Rascunhos e preferências continuam disponíveis; pedidos e entregas não são afetados.</p></div></section> : null}

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Nova campanha</h2><p>Todos os elegíveis: o grupo tem {Number(allGroup?.members ?? 0)} clientes; {Number(allGroup?.eligible_whatsapp ?? 0)} podem receber no WhatsApp.</p></div></div>
      <form action={createCampaignAction} className={styles.detailsBody}>
        <input type="hidden" name="channel" value="whatsapp" />
        <div className={styles.formGrid}>
          <label className={styles.label}>Nome interno<input className={styles.field} name="name" required minLength={2} maxLength={140} /></label>
          <label className={styles.label}>Objetivo<input className={styles.field} name="objective" maxLength={240} /></label>
          <label className={styles.label}>Grupo de clientes<select className={styles.field} name="segmentId"><option value="">Todos · {Number(allGroup?.members ?? 0)} no grupo / {Number(allGroup?.eligible_whatsapp ?? 0)} elegíveis</option>{data.segments.map((segment) => { const count = data.groupSummaries.find((group) => group.segment_id === segment.id); return <option value={segment.id} key={segment.id}>{segment.name} · {Number(count?.members ?? 0)} / {Number(count?.eligible_whatsapp ?? 0)} elegíveis</option>; })}</select></label>
          <label className={styles.label}>Template aprovado da Meta<input className={styles.field} name="templateName" required placeholder="promocao_semana" /></label>
          <label className={styles.label}>Idioma do template<input className={styles.field} name="templateLanguage" defaultValue="pt_BR" required /></label>
          <label className={styles.label}>Quando enviar<select className={styles.field} name="scheduleType" defaultValue="now"><option value="now">Enviar após confirmação</option><option value="once">Uma data específica</option><option value="daily">Todos os dias</option><option value="weekly">Dias da semana</option></select></label>
          <label className={styles.label}>Data inicial<input className={styles.field} name="scheduleStartsOn" type="date" /></label>
          <label className={styles.label}>Horário da loja<input className={styles.field} name="localSendTime" type="time" /></label>
          <label className={styles.label}>Data final<input className={styles.field} name="scheduleEndsOn" type="date" /></label>
        </div>
        <fieldset className={styles.checks}><legend>Dias da semana (para recorrência semanal)</legend>{[[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[7,"Dom"]].map(([value,label]) => <label key={value}><input type="checkbox" name="recurrenceWeekdays" value={value} /> {label}</label>)}</fieldset>
        <label className={styles.label}><span><input name="includeCustomerNameParameter" type="checkbox" /> O template usa <code>{"{{1}}"}</code> como nome do cliente</span></label>
        <label className={styles.label}>Prévia / observação interna<textarea className={`${styles.field} ${styles.textarea}`} name="content" maxLength={4000} placeholder="Conteúdo de referência. O envio usa o template aprovado." /></label>
        <button className={styles.primary} type="submit" disabled={!data.enabled}>Salvar rascunho</button>
      </form>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Histórico e fila</h2><p>Atualize a página para acompanhar resultados consolidados do backend.</p></div></div>
      <div className={styles.list}>{data.campaigns.map((campaign) => {
        const counts = campaign.recipientCounts;
        const queued = campaign.metrics?.queued ?? ((counts.queued ?? 0) + (counts.sending ?? 0) + (counts.failed_transient ?? 0));
        const excluded = (campaign.metrics?.opted_out ?? counts.skipped_opt_out ?? 0) + (campaign.metrics?.invalid_contact ?? counts.skipped_invalid_contact ?? 0);
        return <CampaignCard campaign={campaign} queued={queued} excluded={excluded} enabled={data.enabled} whatsappReady={data.whatsappReady} key={campaign.id} />;
      })}{data.campaigns.length === 0 ? <div className={styles.empty}>Nenhuma campanha criada.</div> : null}</div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Consentimento por cliente</h2><p>Pedido e mensagem transacional não viram automaticamente autorização para promoção. Opt-out sempre prevalece.</p></div></div>
      <div className={styles.list}>{data.customers.slice(0, 150).map((customer) => <article className={styles.item} key={customer.customer_id}><div className={styles.itemMain}><strong>{customer.name}</strong><span className={styles.itemMeta}>{customer.masked_phone ?? "Sem telefone válido"} · {customer.preference_status === "consented" ? "Consentido" : customer.preference_status === "opted_out" ? "Opt-out protegido" : "Sem consentimento"}</span></div>{customer.preference_status === "opted_out" ? <span className={styles.itemMeta}>Somente o próprio cliente pode autorizar novamente.</span> : <form action={setMarketingPreferenceAction}><input type="hidden" name="customerId" value={customer.customer_id} /><select className={styles.field} name="status" defaultValue={customer.preference_status}><option value="not_consented">Sem consentimento</option><option value="consented">Consentiu</option><option value="opted_out">Opt-out</option></select><button className={styles.secondary} type="submit">Salvar</button></form>}</article>)}{data.customers.length === 0 ? <div className={styles.empty}>Nenhum cliente com compra concluída nesta unidade.</div> : null}</div>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }

type CampaignCardProps = {
  campaign: { id: string; name: string; status: string; content: string; template_name: string | null; template_language: string; template_data: { body_parameters?: unknown[] } | null; schedule_type: string; next_run_at: string | null; paused_at: string | null; metrics: { prepared: number; sent: number; delivered: number; read: number; failed: number; responses: number; assisted_orders: number; assisted_revenue_cents: number; coupons_used: number; suppressed: number } | null; occurrences: Array<{ id: string; scheduled_for: string; status: string; member_count: number; eligible_count: number; excluded_count: number }> };
  queued: number; excluded: number; enabled: boolean; whatsappReady: boolean;
};

function CampaignCard({ campaign, queued, excluded, enabled, whatsappReady }: CampaignCardProps) {
  const scheduled = campaign.schedule_type !== "now";
  const metrics = campaign.metrics;
  return <article className={styles.item}>
    <div className={styles.itemMain}><div className={styles.itemTitle}><strong>{campaign.name}</strong><span className={styles.status} data-active={!['completed','canceled'].includes(campaign.status)}>{campaign.paused_at ? "Pausada" : statusLabels[campaign.status] ?? campaign.status}</span></div>
      <span className={styles.itemMeta}>Template: {campaign.template_name ?? "não configurado"} · preparados {metrics?.prepared ?? 0} · fila {queued} · excluídos {excluded}</span>
      <span className={styles.itemMeta}>Enviados {metrics?.sent ?? 0} · entregues {metrics?.delivered ?? 0} · lidos {metrics?.read ?? 0} · respostas {metrics?.responses ?? 0} · falhas {metrics?.failed ?? 0}</span>
      <span className={styles.itemMeta}>Retorno assistido em 7 dias: {metrics?.assisted_orders ?? 0} pedido(s), {money(metrics?.assisted_revenue_cents ?? 0)} · {metrics?.coupons_used ?? 0} cupom(ns) usado(s) · {metrics?.suppressed ?? 0} suprimido(s)</span>
      <span className={styles.itemMeta}>{scheduled ? `Próximo envio: ${campaign.next_run_at ? new Date(campaign.next_run_at).toLocaleString("pt-BR") : "sem nova ocorrência"}` : "Envio único após confirmação"}</span>
      {campaign.occurrences.slice(0, 3).map((occurrence) => <span className={styles.itemMeta} key={occurrence.id}>Ocorrência {new Date(occurrence.scheduled_for).toLocaleString("pt-BR")}: {occurrence.eligible_count} elegíveis, {occurrence.excluded_count} excluídos · {occurrence.status}</span>)}
    </div>
    {campaign.status === "draft" && !scheduled ? <form action={enqueueCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><button className={styles.primary} type="submit" disabled={!enabled || !whatsappReady || !campaign.template_name}>Confirmar e enfileirar elegíveis</button></form> : null}
    {scheduled && !["completed","partially_failed","canceled"].includes(campaign.status) ? <form action={pauseCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="paused" value={campaign.paused_at ? "false" : "true"} /><button className={styles.secondary} type="submit">{campaign.paused_at ? "Retomar" : "Pausar"}</button></form> : null}
    {["draft","scheduled"].includes(campaign.status) ? <details className={styles.details}><summary>Editar próximos envios</summary><form action={updateCampaignContentAction} className={styles.detailsBody}><input type="hidden" name="campaignId" value={campaign.id} /><label className={styles.label}>Template<input className={styles.field} name="templateName" defaultValue={campaign.template_name ?? ""} required /></label><label className={styles.label}>Idioma<input className={styles.field} name="templateLanguage" defaultValue={campaign.template_language} required /></label><label className={styles.label}>Prévia<textarea className={`${styles.field} ${styles.textarea}`} name="content" defaultValue={campaign.content} /></label><label><input name="includeCustomerNameParameter" type="checkbox" defaultChecked={Array.isArray(campaign.template_data?.body_parameters) && campaign.template_data.body_parameters.includes("customer_name")} /> Template usa nome do cliente</label><button className={styles.secondary} type="submit">Salvar nova versão</button></form></details> : null}
    {!["completed","partially_failed","canceled"].includes(campaign.status) ? <form action={cancelCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="reason" value="Cancelada manualmente pelo gestor." /><button className={styles.secondary} type="submit">Cancelar campanha</button></form> : null}
  </article>;
}
