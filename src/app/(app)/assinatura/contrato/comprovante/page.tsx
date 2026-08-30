import Link from "next/link";
import { CustomerSubscriptionService } from "@/server/billing/customer-subscription-service";
import { SubscriptionContractAcceptanceService } from "@/server/billing/subscription-contract-acceptance-service";
import type { ContractCommercialSnapshot } from "@/server/billing/subscription-contract-service";
import { PrintContractButton } from "../print-button";
import styles from "../contract.module.css";

const money = (value: number, currency = "BRL") => (value / 100).toLocaleString("pt-BR", { style: "currency", currency });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não definido";

export default async function ContractReceiptPage() {
  const data = await CustomerSubscriptionService.load();
  if (!data.subscription) return <main className={styles.page}><div className={styles.empty}>Não existe assinatura para consultar.</div></main>;
  const evidence = await SubscriptionContractAcceptanceService.acceptedEvidence(data.subscription.id);
  if (!evidence) return <main className={styles.page}><div className={styles.toolbar}><Link href="/assinatura">← Minha assinatura</Link></div><div className={styles.empty}>Este contrato ainda não foi formalizado. O comprovante será criado automaticamente após o aceite do proprietário.</div></main>;
  const commercial = evidence.commercial_snapshot as unknown as ContractCommercialSnapshot;

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}><Link href="/assinatura/contrato">← Contrato</Link><PrintContractButton label="Imprimir / salvar comprovante" /></div>
      <article className={styles.document}>
        <header className={styles.header}>
          <span className={styles.meta}>COMPROVANTE ELETRÔNICO DE ACEITE</span>
          <h1>PedeAqui · Contrato de Assinatura</h1>
          <span className={styles.meta}>Protocolo {evidence.protocol}</span>
        </header>
        <div className={styles.notice}>Este comprovante referencia o documento e o Anexo Comercial preservados no momento do aceite eletrônico. Dados técnicos de evidência, como IP e user-agent, permanecem protegidos no registro interno e não são exibidos nesta tela.</div>
        <div className={styles.rows}>
          <Row label="Empresa" value={commercial.organization_name} />
          <Row label="Responsável" value={evidence.representative_name} />
          <Row label="E-mail" value={evidence.representative_email} />
          <Row label="Contrato" value={evidence.contract_version} />
          <Row label="Plano" value={commercial.plan_name} />
          <Row label="Mensalidade-base" value={money(commercial.price_cents, commercial.currency)} />
          {commercial.founder_slot ? <Row label="Plano Fundadores" value={`Slot #${commercial.founder_slot} · preço protegido`} /> : null}
          <Row label="Aceito em" value={date(evidence.accepted_at)} />
        </div>
        <section className={styles.section}>
          <h2>Integridade</h2>
          <p>O contrato e o Anexo Comercial foram congelados em um registro append-only. O identificador abaixo permite verificar que o conteúdo preservado corresponde ao documento aceito.</p>
          <div className={styles.notice}><div className={styles.hash}>SHA-256 {evidence.document_sha256}</div></div>
        </section>
        <section className={styles.section}>
          <h2>Protocolo</h2>
          <p className={styles.hash}>{evidence.protocol}</p>
        </section>
      </article>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className={styles.row}><span>{label}</span><strong>{value}</strong></div>;
}
