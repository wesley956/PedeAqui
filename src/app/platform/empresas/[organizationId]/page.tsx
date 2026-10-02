import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../../platform.module.css";
import { billingWhatsAppContactFromMetadata } from "@/server/billing/subscription-whatsapp-contract";
import { reprocessBillingWhatsAppAction, saveBillingWhatsAppContactAction } from "./billing-contact-actions";
import { SubscriptionWhatsAppDispatcher } from "@/server/billing/subscription-whatsapp-dispatcher";

const money = (cents: number | null | undefined) => cents == null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default async function PlatformCompany360Page({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ billingContact?: string; billingReplay?: string }> }) {
  const { organizationId } = await params;
  const data = await PlatformBackofficeService.loadOrganization360(organizationId);
  const organization = data.organization;
  if (!organization) notFound();
  const current = data.subscriptions.find((item) => ["trialing", "active", "past_due"].includes(item.status)) ?? data.subscriptions[0] ?? null;
  const billingContact = billingWhatsAppContactFromMetadata(current?.metadata);
  const billingFeedback = (await searchParams).billingContact;
  const replayFeedback = (await searchParams).billingReplay;
  const billingHistory = data.role === "super_admin" ? await SubscriptionWhatsAppDispatcher.history(organizationId).catch(() => null) : null;
  const functional = current && typeof current.metadata.functional_plan_label === "string" ? current.metadata.functional_plan_label : null;
  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}><Link href="/platform">Painel</Link><span>›</span><span>{organization.name}</span></div>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CLIENTES · EMPRESA 360</p>
          <h1>{organization.name}</h1>
          <p>{organization.legal_name || "Razão social não informada"} · {organization.email || "sem e-mail"} · {organization.phone || "sem telefone"}</p>
        </div>
        <div className={styles.heroBadges}><span className={styles.pill} data-tone={organization.status === "active" ? "good" : "warn"}>{organization.status}</span>{data.founder ? <span className={styles.roleBadge}>Clube Fundadores</span> : null}</div>
      </header>

      <section className={styles.metrics} aria-label="Resumo da empresa">
        <Metric label="Unidades" value={data.stores.length} helper={`${data.stores.filter((item) => item.status === "active").length} ativa(s)`} />
        <Metric label="Usuários" value={data.members.length} helper={`${data.members.filter((item) => item.status === "active").length} ativo(s)`} />
        <Metric label="Mensalidade" value={current?.agreed_price_cents == null ? "—" : money(current.agreed_price_cents)} helper={current?.price_locked ? "preço protegido" : "contrato atual"} />
        <Metric label="Incidentes" value={data.incidents.filter((item) => item.status !== "resolved").length} helper="abertos / acompanhando" />
      </section>

      {data.role === "super_admin" && current ? <section className={styles.section} id="billing-contact">
        <div className={styles.sectionHeader}><div><h2>Responsável pela mensalidade</h2><p>Cadastre o contato financeiro autorizado a receber avisos do PedeAqui. O envio por WhatsApp ainda aguarda a configuração do número oficial da plataforma e homologação.</p></div></div>
        {billingFeedback ? <p role="status">{billingFeedback === "saved" ? "Contato financeiro salvo. Nenhuma mensagem foi enviada." : "Não foi possível salvar. Confira o número e a autorização; se o cadastro mudou, recarregue a página e tente novamente."}</p> : null}
        <form action={saveBillingWhatsAppContactAction} className={styles.formGrid}>
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="subscriptionId" value={current.id} />
          <input type="hidden" name="expectedUpdatedAt" value={current.updated_at} />
          <label>Nome do responsável<input className={styles.field} name="name" required minLength={2} maxLength={120} defaultValue={billingContact?.name ?? ""} /></label>
          <label>WhatsApp com DDI e DDD<input className={styles.field} name="phone" required inputMode="tel" pattern="[1-9][0-9]{9,14}" placeholder="5519999999999" defaultValue={billingContact?.phone ?? ""} /><small>Somente números, incluindo o código do país (55 para Brasil).</small></label>
          <label><input type="checkbox" name="consentConfirmed" defaultChecked={billingContact?.consentConfirmed ?? false} /> O responsável autorizou receber os avisos da mensalidade.</label>
          <label><input type="checkbox" name="enabled" defaultChecked={billingContact?.enabled ?? false} /> Habilitar este contato quando o canal oficial estiver disponível.</label>
          <button className={styles.button}>Salvar contato financeiro</button>
        </form>
      </section> : null}

      {data.role === "super_admin" ? <section className={styles.section} id="billing-deliveries">
        <div className={styles.sectionHeader}><div><h2>Avisos de mensalidade por WhatsApp</h2><p>Aceito significa que a Meta recebeu a mensagem. Resultado incerto exige revisão e não permite reenvio.</p></div></div>
        {replayFeedback ? <p role="status">{replayFeedback === "queued" ? "Nova tentativa autorizada e registrada. O envio depende de o canal oficial estar ativo." : "Reenvio bloqueado. Somente mensagens com rejeição confirmada podem receber nova tentativa."}</p> : null}
        {billingHistory === null ? <p>Histórico temporariamente indisponível.</p> : billingHistory.length === 0 ? <p>Nenhum aviso registrado.</p> : billingHistory.map(delivery => (
          <article key={delivery.notification_id} className={styles.orgCard}>
            <strong>{delivery.state === "sent" ? "Aceito pela Meta" : delivery.state === "rejected" ? "Envio rejeitado" : delivery.state === "ready" ? "Nova tentativa autorizada" : "Aguardando revisão do resultado"}</strong>
            <p>{delivery.attempt_count} tentativa(s) · atualizado em {date(delivery.updated_at)}</p>
            <details><summary>Histórico de tentativas</summary>{delivery.subscription_whatsapp_attempts.map(attempt => <p key={attempt.attempt_token}>{date(attempt.created_at)} · {attempt.state === "sent" ? "Aceito" : attempt.state === "rejected" ? "Rejeitado" : "Resultado pendente de revisão"}{attempt.external_message_id ? ` · referência ${attempt.external_message_id}` : ""}</p>)}</details>
            {delivery.state === "rejected" ? <form action={reprocessBillingWhatsAppAction} className={styles.formGrid}>
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="notificationId" value={delivery.notification_id} />
              <label>Motivo da nova tentativa<input className={styles.field} name="reason" required minLength={5} maxLength={500} placeholder="Informe o que foi corrigido antes de tentar novamente" /></label>
              <button className={styles.button}>Autorizar nova tentativa</button>
            </form> : null}
          </article>
        ))}
      </section> : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Contrato e relacionamento</h2><p>Plano cobrado, equivalência funcional, Clube Fundadores e CRM ficam visíveis no mesmo 360, mas continuam tecnicamente separados.</p></div><Link href="/platform/assinaturas" className={styles.button}>Abrir assinaturas</Link></div>
        {current ? (
          <div className={styles.supportGrid}>
            <Info title="Plano comercial" text={`${current.planName} · ${money(current.agreed_price_cents)}/mês · ${current.payment_status}`} />
            <Info title="Equivalência funcional" text={functional || "Ainda não classificada"} />
            <Info title="Próximo vencimento" text={date(current.next_due_at)} />
            <Info title="Clube Fundadores" text={data.founder ? `${data.founder.status} · nível ${data.founder.level_key} · desde ${date(data.founder.joined_at)}` : "Não participa"} />
            <Info title="CRM" text={data.crm ? `${data.crm.stage} · próximo contato ${date(data.crm.next_action_at)}` : "Sem oportunidade vinculada"} />
            <Info title="Cadastro" text={`${organization.document || "Documento não informado"} · ${organization.timezone}`} />
          </div>
        ) : <div className={styles.empty}>Esta empresa ainda não possui assinatura cadastrada.</div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Unidades</h2><p>Cada loja mantém configuração própria de módulos e revisão concorrente.</p></div></div>
        <div className={styles.orgGrid}>
          {data.stores.map((store) => (
            <Link className={styles.orgCardLink} key={store.id} href={`/platform/empresas/${organizationId}/unidades/${store.id}`}>
              <article className={styles.orgCard}>
                <div className={styles.cardTop}><strong>{store.name}</strong><span className={styles.pill} data-tone={store.status === "active" ? "good" : "warn"}>{store.status}</span></div>
                <span className={styles.meta}>{store.business_type} · preset {store.module_preset} · revisão {store.module_config_revision}</span>
                <span className={styles.open360}>Abrir unidade 360 →</span>
              </article>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Equipe do cliente</h2><p>Usuários da organização. Estes acessos não concedem administração da plataforma.</p></div></div>
        <div className={styles.featureList}>
          {data.members.map((member) => <div className={styles.featureRow} key={member.user_id}><span><strong>{member.email}</strong><small>Role ID {member.role_id || "não definido"}</small></span><span className={styles.pill} data-tone={member.status === "active" ? "good" : "warn"}>{member.status}</span></div>)}
          {data.members.length === 0 ? <div className={styles.empty}>Nenhum membro encontrado.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Módulos adicionais e cobrança</h2><p>Add-ons preservam preço histórico e vigência individual.</p></div></div>
        <div className={styles.featureList}>
          {data.addons.map((addon) => <div className={styles.featureRow} key={addon.id}><span><strong>{addon.featureName}</strong><small>{date(addon.starts_at)} → {date(addon.ends_at)}</small></span><span><strong>{money(addon.unit_price_cents * addon.quantity)}/mês</strong><span className={styles.pill} data-tone={addon.status === "active" ? "good" : "warn"}>{addon.status}</span></span></div>)}
          {data.addons.length === 0 ? <div className={styles.empty}>Nenhum módulo cobrado separadamente.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Mensalidades recentes</h2><p>Histórico financeiro da assinatura.</p></div></div>
        <div className={styles.featureList}>
          {data.invoices.map((invoice) => <div className={styles.featureRow} key={invoice.id}><span><strong>{invoice.reference_month}</strong><small>Vencimento {date(invoice.due_at)}{invoice.paid_at ? ` · pago ${date(invoice.paid_at)}` : ""}</small></span><span><strong>{money(invoice.total_amount_cents)}</strong><span className={styles.pill} data-tone={invoice.status === "paid" ? "good" : invoice.status === "overdue" ? "danger" : "warn"}>{invoice.status}</span></span></div>)}
          {data.invoices.length === 0 ? <div className={styles.empty}>Nenhuma mensalidade gerada ainda.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Incidentes vinculados</h2><p>Problemas técnicos associados diretamente a esta empresa.</p></div></div>
        <div className={styles.featureList}>
          {data.incidents.map((incident) => <div className={styles.featureRow} key={incident.id}><span><strong>{incident.title}</strong><small>{incident.summary}</small></span><span className={styles.pill} data-tone={incident.status === "resolved" ? "good" : incident.severity === "critical" || incident.severity === "high" ? "danger" : "warn"}>{incident.status}</span></div>)}
          {data.incidents.length === 0 ? <div className={styles.empty}>Nenhum incidente vinculado.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong style={{ fontSize: typeof value === "string" && value.includes("R$") ? 20 : undefined }}>{value}</strong><small>{helper}</small></div>;
}
function Info({ title, text }: { title: string; text: string }) { return <article className={styles.supportCard}><strong>{title}</strong><span>{text}</span></article>; }
