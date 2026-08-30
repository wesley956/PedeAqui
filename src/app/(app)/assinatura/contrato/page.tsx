import Link from "next/link";
import { CustomerSubscriptionService } from "@/server/billing/customer-subscription-service";
import { SubscriptionContractAcceptanceService } from "@/server/billing/subscription-contract-acceptance-service";
import {
  SubscriptionContractService,
  type ContractCommercialSnapshot,
  type SubscriptionContractDocument,
} from "@/server/billing/subscription-contract-service";
import { PrintContractButton } from "./print-button";
import styles from "./contract.module.css";

const money = (value: number, currency = "BRL") => (value / 100).toLocaleString("pt-BR", { style: "currency", currency });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não definido";

export default async function SubscriptionContractPage() {
  const data = await CustomerSubscriptionService.load();
  if (!data.subscription) return <main className={styles.page}><div className={styles.empty}>Não existe uma assinatura para exibir o contrato.</div></main>;
  const status = await SubscriptionContractAcceptanceService.status(data.subscription.id);
  const evidence = status.state === "accepted" ? await SubscriptionContractAcceptanceService.acceptedEvidence(data.subscription.id) : null;

  if (!status.contractorConfigured && !evidence) {
    return <main className={styles.page}><div className={styles.toolbar}><Link href="/assinatura">← Minha assinatura</Link></div><div className={styles.empty}>O contrato está em preparação. A identificação jurídica da CONTRATADA precisa ser concluída antes que o documento seja liberado para aceite.</div></main>;
  }

  const document = evidence
    ? evidence.contract_document as unknown as SubscriptionContractDocument
    : SubscriptionContractService.document(status.contractorIdentity);
  const acceptedCommercial = evidence ? evidence.commercial_snapshot as unknown as ContractCommercialSnapshot : null;
  const subscription = data.subscription;

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/assinatura">← Minha assinatura</Link>
        <div><PrintContractButton />{evidence ? <> <Link href="/assinatura/contrato/comprovante">Comprovante</Link></> : null}</div>
      </div>
      <article className={styles.document}>
        <header className={styles.header}>
          <span className={styles.meta}>{evidence ? "DOCUMENTO ACEITO E PRESERVADO" : "DOCUMENTO PARA LEITURA E ACEITE"}</span>
          <h1>{document.title}</h1>
          <span className={styles.meta}>Versão {document.version} · vigência {new Date(`${document.effective_date}T12:00:00`).toLocaleDateString("pt-BR")}</span>
          {evidence ? <span className={styles.meta}>Aceito em {date(evidence.accepted_at)} · protocolo {evidence.protocol}</span> : null}
        </header>

        {document.sections.map((section) => (
          <section key={section.number} className={styles.section}>
            <h2>{section.number}. {section.title}</h2>
            {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>
        ))}

        <section className={styles.annex}>
          <h2>Anexo I – Resumo Comercial da Assinatura</h2>
          {evidence && acceptedCommercial ? (
            <>
              <div className={styles.notice}>Este anexo é o snapshot imutável registrado no momento do aceite. Alterações posteriores da operação não reescrevem este documento.</div>
              <div className={styles.rows}>
                <Row label="Empresa" value={acceptedCommercial.organization_name} />
                <Row label="Plano" value={acceptedCommercial.plan_name} />
                <Row label="Mensalidade-base" value={money(acceptedCommercial.price_cents, acceptedCommercial.currency)} />
                <Row label="Vencimento" value={acceptedCommercial.billing_due_day ? `Dia ${acceptedCommercial.billing_due_day}` : "A definir"} />
                <Row label="Preço protegido" value={acceptedCommercial.price_locked ? "Sim" : "Não"} />
                {acceptedCommercial.founder_slot ? <Row label="Condição Fundador" value={`Slot #${acceptedCommercial.founder_slot}`} /> : null}
                {acceptedCommercial.founder_member_since ? <Row label="Ingresso Fundador" value={date(acceptedCommercial.founder_member_since)} /> : null}
                <Row label="Capturado em" value={date(acceptedCommercial.captured_at)} />
              </div>
              {acceptedCommercial.addons.length ? <><h3>Módulos adicionais cobrados</h3><ul className={styles.list}>{acceptedCommercial.addons.map((addon, index) => <li key={`${addon.name}-${index}`}>{addon.name} · {addon.quantity} × {money(addon.unit_price_cents, addon.currency)}/mês</li>)}</ul></> : null}
              {acceptedCommercial.modules.length ? <><h3>Módulos ativos no momento do aceite</h3><p>{acceptedCommercial.modules.join(", ")}</p></> : null}
              <div className={styles.notice}><strong>Integridade do documento:</strong><div className={styles.hash}>SHA-256 {evidence.document_sha256}</div></div>
            </>
          ) : (
            <>
              <div className={styles.notice}>Esta é a condição comercial que será congelada junto ao contrato quando o proprietário confirmar o aceite.</div>
              <div className={styles.rows}>
                <Row label="Empresa" value={data.organization.name} />
                <Row label="Plano" value={subscription.contractPlanName} />
                <Row label="Mensalidade-base" value={money(subscription.agreedPriceCents, subscription.currency)} />
                <Row label="Módulos extras" value={money(subscription.addonTotalCents, subscription.currency)} />
                <Row label="Total mensal atual" value={money(subscription.totalMonthlyCents, subscription.currency)} />
                <Row label="Vencimento" value={subscription.billingDueDay ? `Dia ${subscription.billingDueDay}` : "A definir"} />
                <Row label="Preço protegido" value={subscription.priceLocked ? "Sim" : "Não"} />
                {subscription.founderSlot ? <Row label="Condição Fundador" value={`Slot #${subscription.founderSlot}`} /> : null}
              </div>
              {data.addons.length ? <><h3>Módulos adicionais cobrados</h3><ul className={styles.list}>{data.addons.map((addon) => <li key={addon.id}>{addon.feature_name_snapshot} · {addon.quantity} × {money(addon.unit_price_cents, subscription.currency)}/mês</li>)}</ul></> : null}
            </>
          )}
        </section>
      </article>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className={styles.row}><span>{label}</span><strong>{value}</strong></div>;
}
