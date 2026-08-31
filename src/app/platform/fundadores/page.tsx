import Link from "next/link";
import { PlatformBackofficeService } from "@/server/platform/platform-backoffice-service";
import styles from "../platform.module.css";

const money = (cents: number | null) => cents === null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) => value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default async function PlatformFundadoresPage() {
  const data = await PlatformBackofficeService.loadFounders();
  const active = data.rows.filter((item) => item.status === "active");
  const balance = data.rows.reduce((sum, item) => sum + item.balanceUnits, 0);
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>COMERCIAL · FUNDADORES</p>
          <h1>Condição Fundador e clube de benefícios</h1>
          <p>Fundador não é um quarto plano. É uma condição comercial que mantém o cliente no plano-base contratado, protege a mensalidade-base em R$ 79,90 e permite cobrar módulos extras separadamente. O clube abaixo é uma camada opcional de benefícios e fidelidade.</p>
        </div>
        <Link href="/platform/assinaturas" className={styles.button}>Gerenciar assinaturas</Link>
      </header>

      <section className={styles.metrics} aria-label="Resumo dos Fundadores">
        <Metric label="Fundadores ativos" value={String(active.length)} helper="sem limite de vagas" />
        <Metric label="PedeCoins emitidos" value={String(balance)} helper="saldo líquido do clube" />
        <Metric label="Níveis cadastrados" value={String(data.levels.length)} helper="benefícios opcionais" />
        <Metric label="Benefícios ativos" value={String(data.benefits.filter((item) => item.active).length)} helper="catálogo do clube" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Clientes Fundadores</h2><p>Plano-base, preço protegido e clube aparecem separados para não misturar contrato, módulos e fidelidade.</p></div>
        </div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <div className={styles.featureRow} key={item.id}>
              <span>
                <strong>{item.organizationName}{item.founderSlot ? ` · Fundador #${item.founderSlot}` : ""}</strong>
                <small>Plano-base: {item.contractPlan ?? "—"} · entrada no clube {date(item.joined_at)}</small>
                <small>Preço-base {money(item.agreedPriceCents)}{item.priceLocked ? " protegido" : ""} · módulos adicionais são cobrados à parte · próximo vencimento {date(item.nextDueAt)}</small>
              </span>
              <span style={{ alignItems: "flex-end" }}>
                <span className={styles.pill} data-tone={item.status === "active" ? "good" : item.status === "paused" ? "warn" : "danger"}>{item.status}</span>
                <strong>{item.balanceUnits} PedeCoins</strong>
                <small>{item.ledgerEntries} movimento(s) do clube</small>
              </span>
            </div>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhum cliente com condição Fundador cadastrado.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Níveis do clube</h2><p>Esses níveis são benefícios opcionais e não alteram plano-base, preço protegido nem módulos contratados.</p></div></div>
        <div className={styles.planGrid}>
          {data.levels.map((level) => (
            <article className={styles.planCard} key={level.key}>
              <div className={styles.cardTop}><strong>{level.name}</strong><span className={styles.pill} data-tone={level.active ? "good" : "neutral"}>{level.active ? "Ativo" : "Inativo"}</span></div>
              <span className={styles.meta}>{level.description || "Sem descrição."}</span>
              <span className={styles.meta}>Tempo mínimo: {level.min_tenure_months} mês(es)</span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Marketplace de benefícios</h2><p>Desconto, publicidade, serviços, acesso antecipado e cashback pertencem ao clube. Nenhum benefício altera automaticamente a assinatura comercial.</p></div></div>
        <div className={styles.featureList}>
          {data.benefits.map((benefit) => (
            <div className={styles.featureRow} key={benefit.id}>
              <span><strong>{benefit.name}</strong><small>{benefit.description} · {benefit.kind}</small></span>
              <span style={{ alignItems: "flex-end" }}><span className={styles.pill} data-tone={benefit.active ? "good" : "warn"}>{benefit.active ? "Disponível" : "Rascunho"}</span><strong>{benefit.cost_units === null ? "Sem custo definido" : `${benefit.cost_units} PedeCoins`}</strong></span>
            </div>
          ))}
          {data.benefits.length === 0 ? <div className={styles.empty}>Nenhum benefício publicado. A condição Fundador continua válida independentemente deste catálogo.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}
