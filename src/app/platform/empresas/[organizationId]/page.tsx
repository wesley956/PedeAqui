import Link from "next/link";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../../platform.module.css";

const money = (cents: number | null | undefined) => cents == null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default async function PlatformCompany360Page({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const data = await PlatformBackofficeService.loadOrganization360(organizationId);
  const current = data.subscriptions.find((item) => ["trialing", "active", "past_due"].includes(item.status)) ?? data.subscriptions[0] ?? null;
  const functional = current && typeof current.metadata.functional_plan_label === "string" ? current.metadata.functional_plan_label : null;
  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}><Link href="/platform">Painel</Link><span>›</span><span>{data.organization.name}</span></div>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>CLIENTES · EMPRESA 360</p>
          <h1>{data.organization.name}</h1>
          <p>{data.organization.legal_name || "Razão social não informada"} · {data.organization.email || "sem e-mail"} · {data.organization.phone || "sem telefone"}</p>
        </div>
        <div className={styles.heroBadges}><span className={styles.pill} data-tone={data.organization.status === "active" ? "good" : "warn"}>{data.organization.status}</span>{data.founder ? <span className={styles.roleBadge}>Clube Fundadores</span> : null}</div>
      </header>

      <section className={styles.metrics} aria-label="Resumo da empresa">
        <Metric label="Unidades" value={data.stores.length} helper={`${data.stores.filter((item) => item.status === "active").length} ativa(s)`} />
        <Metric label="Usuários" value={data.members.length} helper={`${data.members.filter((item) => item.status === "active").length} ativo(s)`} />
        <Metric label="Mensalidade" value={current?.agreed_price_cents == null ? "—" : money(current.agreed_price_cents)} helper={current?.price_locked ? "preço protegido" : "contrato atual"} />
        <Metric label="Incidentes" value={data.incidents.filter((item) => item.status !== "resolved").length} helper="abertos / acompanhando" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Contrato e relacionamento</h2><p>Plano cobrado, equivalência funcional, Clube Fundadores e CRM ficam visíveis no mesmo 360, mas continuam tecnicamente separados.</p></div><Link href="/platform/assinaturas" className={styles.button}>Abrir assinaturas</Link></div>
        {current ? (
          <div className={styles.supportGrid}>
            <Info title="Plano comercial" text={`${current.planName} · ${money(current.agreed_price_cents)}/mês · ${current.payment_status}`} />
            <Info title="Equivalência funcional" text={functional || "Ainda não classificada"} />
            <Info title="Próximo vencimento" text={date(current.next_due_at)} />
            <Info title="Clube Fundadores" text={data.founder ? `${data.founder.status} · nível ${data.founder.level_key} · desde ${date(data.founder.joined_at)}` : "Não participa"} />
            <Info title="CRM" text={data.crm ? `${data.crm.stage} · próximo contato ${date(data.crm.next_action_at)}` : "Sem oportunidade vinculada"} />
            <Info title="Cadastro" text={`${data.organization.document || "Documento não informado"} · ${data.organization.timezone}`} />
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
