import Link from "next/link";
import { cancelCampaignAction, createCampaignAction, enqueueCampaignAction, setMarketingPreferenceAction } from "@/features/growth/actions";
import { GrowthService } from "@/server/growth/growth-service";
import styles from "../growth.module.css";

const statusLabels: Record<string, string> = { draft: "Rascunho", scheduled: "Agendada", running: "Em envio", completed: "Concluída", partially_failed: "Concluída com falhas", canceled: "Cancelada" };

export default async function CampaignCenterPage() {
  const data = await GrowthService.loadCampaignCenter();
  return <main className={styles.root}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>GROWTH · CAMPANHAS</p><h1>Campanhas pelo WhatsApp oficial</h1><p>Envie templates aprovados somente para clientes elegíveis. A fila controla volume, retry, opt-out e isolamento da unidade.</p></div><Link href="/crescimento" className={styles.secondary}>Voltar ao Growth</Link></header>

    <section className={styles.metrics} aria-label="Prontidão de campanhas">
      <Metric label="Elegíveis" value={data.eligibleCustomers} />
      <Metric label="Opt-out" value={data.optedOutCustomers} />
      <Metric label="Sem consentimento" value={data.notConsentedCustomers} />
      <Metric label="Limite por minuto" value={data.ratePerMinute} />
      <Metric label="Canal oficial" value={data.whatsappReady ? "Pronto" : "Revisar"} />
    </section>

    {!data.enabled ? <section className={styles.section}><div className={styles.empty}><strong>Campanhas estão desligadas para esta loja.</strong><p>O super admin precisa habilitar Growth + Clientes + Conversas e depois a subconfiguração de campanhas.</p></div></section> : null}
    {data.enabled && !data.whatsappReady ? <section className={styles.section}><div className={styles.empty}><strong>Conecte o WhatsApp oficial antes de enviar.</strong><p>Rascunhos e preferências continuam disponíveis; pedidos e entregas não são afetados.</p></div></section> : null}

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Nova campanha</h2><p>“Todos” significa todos os clientes consentidos, com telefone válido e sem opt-out.</p></div></div>
      <form action={createCampaignAction} className={styles.detailsBody}>
        <input type="hidden" name="channel" value="whatsapp" />
        <div className={styles.formGrid}>
          <label className={styles.label}>Nome interno<input className={styles.field} name="name" required minLength={2} maxLength={140} /></label>
          <label className={styles.label}>Objetivo<input className={styles.field} name="objective" maxLength={240} /></label>
          <label className={styles.label}>Público<select className={styles.field} name="segmentId"><option value="">Todos os elegíveis</option>{data.segments.map((segment) => <option value={segment.id} key={segment.id}>{segment.name}</option>)}</select></label>
          <label className={styles.label}>Template aprovado da Meta<input className={styles.field} name="templateName" required placeholder="promocao_semana" /></label>
          <label className={styles.label}>Idioma do template<input className={styles.field} name="templateLanguage" defaultValue="pt_BR" required /></label>
        </div>
        <label className={styles.label}><span><input name="includeCustomerNameParameter" type="checkbox" /> O template usa <code>{"{{1}}"}</code> como nome do cliente</span></label>
        <label className={styles.label}>Prévia / observação interna<textarea className={`${styles.field} ${styles.textarea}`} name="content" maxLength={4000} placeholder="Conteúdo de referência. O envio usa o template aprovado." /></label>
        <button className={styles.primary} type="submit" disabled={!data.enabled}>Salvar rascunho</button>
      </form>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Histórico e fila</h2><p>Atualize a página para acompanhar resultados consolidados do backend.</p></div></div>
      <div className={styles.list}>{data.campaigns.map((campaign) => {
        const counts = campaign.recipientCounts;
        const queued = (counts.queued ?? 0) + (counts.sending ?? 0) + (counts.failed_transient ?? 0);
        const sent = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0);
        const excluded = (counts.skipped_opt_out ?? 0) + (counts.skipped_invalid_contact ?? 0);
        return <article className={styles.item} key={campaign.id}><div className={styles.itemMain}><div className={styles.itemTitle}><strong>{campaign.name}</strong><span className={styles.status} data-active={!['completed','canceled'].includes(campaign.status)}>{statusLabels[campaign.status] ?? campaign.status}</span></div><span className={styles.itemMeta}>Template: {campaign.template_name ?? "não configurado"} · fila {queued} · enviados {sent} · excluídos {excluded}</span></div>{campaign.status === "draft" ? <form action={enqueueCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><button className={styles.primary} type="submit" disabled={!data.enabled || !data.whatsappReady || !campaign.template_name}>Confirmar e enfileirar elegíveis</button></form> : null}{!["completed","partially_failed","canceled"].includes(campaign.status) ? <form action={cancelCampaignAction}><input type="hidden" name="campaignId" value={campaign.id} /><input type="hidden" name="reason" value="Cancelada manualmente pelo gestor." /><button className={styles.secondary} type="submit">Cancelar campanha</button></form> : null}</article>;
      })}{data.campaigns.length === 0 ? <div className={styles.empty}>Nenhuma campanha criada.</div> : null}</div>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeader}><div><h2>Consentimento por cliente</h2><p>Pedido e mensagem transacional não viram automaticamente autorização para promoção.</p></div></div>
      <div className={styles.list}>{data.customers.slice(0, 150).map((customer) => <article className={styles.item} key={customer.id}><div className={styles.itemMain}><strong>{customer.name}</strong><span className={styles.itemMeta}>{customer.phone_normalized ?? "Sem telefone"} · {customer.preference?.status === "consented" ? "Consentido" : customer.preference?.status === "opted_out" ? "Opt-out" : "Sem consentimento"}</span></div><form action={setMarketingPreferenceAction}><input type="hidden" name="customerId" value={customer.id} /><select className={styles.field} name="status" defaultValue={customer.preference?.status ?? "not_consented"}><option value="not_consented">Sem consentimento</option><option value="consented">Consentiu</option><option value="opted_out">Opt-out</option></select><button className={styles.secondary} type="submit">Salvar</button></form></article>)}{data.customers.length === 0 ? <div className={styles.empty}>Nenhum cliente cadastrado nesta organização.</div> : null}</div>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }
