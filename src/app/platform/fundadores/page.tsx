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
          <p className={styles.eyebrow}>COMERCIAL · CLUBE FUNDADORES</p>
          <h1>Clientes mais seletos do PedeAqui</h1>
          <p>O Clube Fundadores é separado dos planos comuns. A entrada é administrativa, exige contrato Fundadores protegido e mantém benefícios, níveis e saldo em uma razão imutável.</p>
        </div>
        <Link href="/platform/produto" className={styles.button}>Ver produto e módulos</Link>
      </header>

      <section className={styles.metrics} aria-label="Resumo do Clube Fundadores">
        <Metric label="Membros ativos" value={String(active.length)} helper="entrada seletiva" />
        <Metric label="PedeCoins emitidos" value={String(balance)} helper="saldo líquido atual" />
        <Metric label="Níveis cadastrados" value={String(data.levels.length)} helper="progressão configurável" />
        <Metric label="Benefícios ativos" value={String(data.benefits.filter((item) => item.active).length)} helper="catálogo do clube" />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Membros</h2><p>Contrato comercial, equivalência funcional e Clube Fundadores aparecem separados para não misturar preço, módulos e fidelidade.</p></div>
        </div>
        <div className={styles.featureList}>
          {data.rows.map((item) => (
            <div className={styles.featureRow} key={item.id}>
              <span>
                <strong>{item.organizationName}{item.founderSlot ? ` · Fundador #${item.founderSlot}` : ""}</strong>
                <small>Contrato: {item.contractPlan ?? "—"} · Equivalência: {item.functionalPlanLabel ?? "a classificar"} · entrada {date(item.joined_at)}</small>
                <small>Mensalidade {money(item.agreedPriceCents)}{item.priceLocked ? " protegida" : ""} · próximo vencimento {date(item.nextDueAt)}</small>
              </span>
              <span style={{ alignItems: "flex-end" }}>
                <span className={styles.pill} data-tone={item.status === "active" ? "good" : item.status === "paused" ? "warn" : "danger"}>{item.status}</span>
                <strong>{item.balanceUnits} PedeCoins</strong>
                <small>{item.ledgerEntries} movimento(s)</small>
              </span>
            </div>
          ))}
          {data.rows.length === 0 ? <div className={styles.empty}>Nenhum membro cadastrado no Clube Fundadores.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Níveis do clube</h2><p>A progressão automática permanece desligada até definirmos os marcos de tempo e as regras de recompensa.</p></div></div>
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
        <div className={styles.sectionHeader}><div><h2>Marketplace de benefícios</h2><p>Desconto, publicidade, serviços, acesso antecipado e cashback poderão ser cadastrados aqui. Cashback sacável continuará desativado até revisão fiscal/contábil.</p></div></div>
        <div className={styles.featureList}>
          {data.benefits.map((benefit) => (
            <div className={styles.featureRow} key={benefit.id}>
              <span><strong>{benefit.name}</strong><small>{benefit.description} · {benefit.kind}</small></span>
              <span style={{ alignItems: "flex-end" }}><span className={styles.pill} data-tone={benefit.active ? "good" : "warn"}>{benefit.active ? "Disponível" : "Rascunho"}</span><strong>{benefit.cost_units === null ? "Sem custo definido" : `${benefit.cost_units} PedeCoins`}</strong></span>
            </div>
          ))}
          {data.benefits.length === 0 ? <div className={styles.empty}>Nenhum benefício publicado. A estrutura está pronta, mas o catálogo ficará vazio até definirmos as regras.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}
