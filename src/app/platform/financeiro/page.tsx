import Link from "next/link";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../platform.module.css";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não definido";

export default async function PlatformFinanceiroPage() {
  const data = await PlatformBackofficeService.loadFinance();
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>COMERCIAL · FINANCEIRO PEDEAQUI</p>
          <h1>Receita SaaS, cobranças e inadimplência</h1>
          <p>Visão financeira da plataforma separada do caixa dos restaurantes. O MRR considera contratos vigentes e módulos adicionais ativos.</p>
        </div>
        <Link className={styles.button} href="/platform/assinaturas">Gerenciar assinaturas</Link>
      </header>

      <section className={styles.metrics} aria-label="Indicadores financeiros">
        <Metric label="MRR" value={money(data.metrics.mrrCents)} helper="receita mensal recorrente" />
        <Metric label="ARPU" value={money(data.metrics.arpuCents)} helper="receita média por contrato" />
        <Metric label="Contratos" value={String(data.metrics.activeContracts)} helper="ativos / vigentes" />
        <Metric label="Em atraso" value={money(data.metrics.overdueCents)} helper={`${data.metrics.overdueCount} mensalidade(s)`} />
        <Metric label="Recebido 30 dias" value={money(data.metrics.received30dCents)} helper="pagamentos confirmados" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Receita recorrente por cliente</h2><p>Fundadores aparecem com o contrato protegido e continuam separados da equivalência funcional.</p></div>
        </div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <div className={styles.featureRow} key={item.id}>
              <span>
                <strong>{item.organizationName}{item.founder ? " · Fundador" : ""}</strong>
                <small>Base {money(item.agreedPriceCents)} · extras {money(item.addonCents)} · próximo vencimento {date(item.nextDueAt)}</small>
              </span>
              <span style={{ alignItems: "flex-end" }}>
                <strong>{money(item.mrrCents)}/mês</strong>
                <span className={styles.pill} data-tone={item.paymentStatus === "overdue" ? "danger" : item.paymentStatus === "pending" ? "warn" : "good"}>{item.paymentStatus}</span>
              </span>
            </div>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhum contrato recorrente encontrado.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Mensalidades recentes</h2><p>Faturas preservam referência, vencimento e pagamento independentemente do plano atual.</p></div></div>
        <div className={styles.featureList}>
          {data.invoices.slice(0, 20).map((invoice) => (
            <div className={styles.featureRow} key={invoice.id}>
              <span><strong>{new Date(`${invoice.reference_month}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}</strong><small>Vencimento {date(invoice.due_at)}</small></span>
              <span style={{ alignItems: "flex-end" }}><strong>{money(invoice.total_amount_cents ?? 0)}</strong><span className={styles.pill} data-tone={invoice.status === "overdue" ? "danger" : invoice.status === "paid" ? "good" : "warn"}>{invoice.status}</span></span>
            </div>
          ))}
          {data.invoices.length === 0 ? <div className={styles.empty}>As primeiras mensalidades aparecerão aqui quando forem geradas.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong style={{ fontSize: 22 }}>{value}</strong><small>{helper}</small></div>;
}
