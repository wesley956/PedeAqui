import Image from "next/image";
import { CustomerSubscriptionService } from "@/server/billing/customer-subscription-service";
import { GeneratePixButton } from "./generate-pix-button";
import { PixCopyButton } from "./pix-copy-button";
import styles from "./assinatura.module.css";

const money = (value: number, currency = "BRL") => (value / 100).toLocaleString("pt-BR", { style: "currency", currency });
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não definido";
const subscriptionStatus: Record<string,string> = { active:"Ativa",trialing:"Em teste",past_due:"Pagamento em atenção",cancelled:"Cancelada",expired:"Encerrada" };
const paymentStatus: Record<string,string> = { not_started:"Cobrança ainda não iniciada",pending:"Pagamento pendente",paid:"Pago",overdue:"Em atraso",waived:"Isento neste vencimento" };
const invoiceStatus: Record<string,string> = { pending:"Pendente",paid:"Paga",overdue:"Em atraso",cancelled:"Cancelada",waived:"Isenta" };

export default async function CustomerSubscriptionPage() {
  const data = await CustomerSubscriptionService.load();
  const subscription = data.subscription;

  if (!subscription) {
    return <main className={styles.page}><section className={styles.hero}><div><p className={styles.eyebrow}>MINHA CONTA</p><h1>Minha assinatura</h1><p>A assinatura do PedeAqui ainda não foi configurada para esta empresa.</p></div></section></main>;
  }

  const loadedAt = Date.parse(data.loadedAt);
  const openInvoice = data.invoices.find((invoice) => invoice.status === "pending" || invoice.status === "overdue") ?? null;
  const currentPix = openInvoice
    ? data.pixCharges.find((charge) => charge.invoice_id === openInvoice.id && charge.status === "pending" && (!charge.expires_at || Date.parse(charge.expires_at) > loadedAt)) ?? null
    : null;
  const hadPixForOpenInvoice = openInvoice ? data.pixCharges.some((charge) => charge.invoice_id === openInvoice.id) : false;
  const functionalDiffers = subscription.functionalPlanLabel && subscription.functionalPlanLabel !== subscription.contractPlanName;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>MINHA CONTA · PEDEAQUI</p>
          <h1>Minha assinatura</h1>
          <p>Veja seu plano, mensalidade, próximos vencimentos, módulos adicionais e histórico de pagamentos em um só lugar.</p>
        </div>
        <span className={styles.badge}>{subscriptionStatus[subscription.status] ?? subscription.status}</span>
      </section>

      <section className={styles.metrics} aria-label="Resumo da assinatura">
        <Metric label="Plano contratado" value={subscription.contractPlanName} />
        <Metric label="Mensalidade atual" value={money(subscription.totalMonthlyCents, subscription.currency)} />
        <Metric label="Próximo vencimento" value={subscription.nextDueAt ? new Date(subscription.nextDueAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "A definir"} />
        <Metric label="Pagamento" value={paymentStatus[subscription.paymentStatus] ?? subscription.paymentStatus} />
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div><p className={styles.eyebrow}>CONTRATO</p><h2>Seu plano no PedeAqui</h2></div>
          <div className={styles.rows}>
            <Row label="Plano comercial" value={subscription.contractPlanName} />
            {functionalDiffers ? <Row label="Recursos equivalentes" value={subscription.functionalPlanLabel ?? ""} helper="Isso descreve os recursos ativos; não muda o valor do seu contrato." /> : null}
            <Row label="Mensalidade-base" value={money(subscription.agreedPriceCents, subscription.currency)} />
            <Row label="Módulos extras" value={money(subscription.addonTotalCents, subscription.currency)} />
            <Row label="Total mensal" value={money(subscription.totalMonthlyCents, subscription.currency)} />
            <Row label="Dia de vencimento" value={subscription.billingDueDay ? `Dia ${subscription.billingDueDay}` : "A definir"} />
          </div>
          {subscription.founderSlot ? <div className={styles.founder}><strong>Cliente Fundador #{subscription.founderSlot}</strong><br />Seu valor especial de {money(subscription.agreedPriceCents, subscription.currency)} está protegido no contrato.</div> : null}
          {subscription.priceLocked && !subscription.founderSlot ? <div className={styles.founder}><strong>Valor protegido</strong><br />Sua condição comercial atual está bloqueada conforme o contrato.</div> : null}
        </article>

        <article className={styles.card}>
          <div><p className={styles.eyebrow}>MÓDULOS</p><h2>O que foi contratado além do plano</h2></div>
          {data.addons.length ? <div className={styles.rows}>{data.addons.map((addon) => <Row key={addon.id} label={addon.feature_name_snapshot} value={`${money(addon.unit_price_cents * addon.quantity)}/mês`} />)}</div> : <div className={styles.empty}>Nenhum módulo adicional cobrado separadamente.</div>}
        </article>
      </section>

      <section className={styles.card}>
        <div><p className={styles.eyebrow}>PAGAMENTO</p><h2>PIX da mensalidade</h2></div>
        {currentPix ? (
          <div className={styles.pix}>
            {currentPix.qr_code_base64 ? <Image className={styles.qr} src={`data:image/png;base64,${currentPix.qr_code_base64}`} width={180} height={180} alt="QR Code PIX da mensalidade do PedeAqui" unoptimized /> : <div className={styles.empty}>QR Code visual indisponível. Use o código PIX abaixo.</div>}
            <div className={styles.pixBody}>
              <strong>{money(currentPix.amount_cents, currentPix.currency)} · aguardando pagamento</strong>
              <span className={styles.muted}>Validade do PIX: {dateTime(currentPix.expires_at)}. A confirmação será registrada automaticamente após o Mercado Pago confirmar o pagamento.</span>
              {currentPix.qr_code ? <><textarea className={styles.pixCode} value={currentPix.qr_code} readOnly aria-label="PIX Copia e Cola" /><div className={styles.pixActions}><PixCopyButton code={currentPix.qr_code} />{currentPix.ticket_url ? <a href={currentPix.ticket_url} target="_blank" rel="noreferrer">Abrir pagamento</a> : null}</div></> : null}
            </div>
          </div>
        ) : openInvoice ? (
          <div className={styles.empty}>
            Existe uma mensalidade de {money(openInvoice.total_amount_cents ?? openInvoice.base_amount_cents, openInvoice.currency)} com vencimento em {dateTime(openInvoice.due_at)}. Gere o PIX agora; se um QR anterior tiver expirado, o PedeAqui confere o status no Mercado Pago antes de emitir outro.
            <GeneratePixButton invoiceId={openInvoice.id} renew={hadPixForOpenInvoice} />
          </div>
        ) : (
          <div className={styles.empty}>Nenhuma cobrança PIX pendente neste momento. A próxima mensalidade e seu PIX serão gerados automaticamente no ciclo de renovação.</div>
        )}
      </section>

      <section className={styles.card}>
        <div><p className={styles.eyebrow}>HISTÓRICO</p><h2>Mensalidades</h2></div>
        {data.invoices.length ? <div className={styles.rows}>{data.invoices.map((invoice) => <Row key={invoice.id} label={new Date(`${invoice.reference_month}T12:00:00`).toLocaleDateString("pt-BR", { month:"long", year:"numeric" })} value={`${money(invoice.total_amount_cents ?? invoice.base_amount_cents, invoice.currency)} · ${invoiceStatus[invoice.status] ?? invoice.status}`} helper={`Vencimento: ${dateTime(invoice.due_at)}`} />)}</div> : <div className={styles.empty}>Ainda não há mensalidades emitidas.</div>}
      </section>

      <section className={styles.card}>
        <div><p className={styles.eyebrow}>PAGAMENTOS</p><h2>Pagamentos registrados</h2></div>
        {data.payments.length ? <div className={styles.rows}>{data.payments.map((payment) => <Row key={payment.id} label={payment.method === "pix" ? "PIX" : payment.method.toUpperCase()} value={`${money(payment.amount_cents, payment.currency)} · ${payment.status === "paid" ? "Pago" : payment.status}`} helper={payment.paid_at ? `Confirmado em ${dateTime(payment.paid_at)}` : `Registrado em ${dateTime(payment.created_at)}`} />)}</div> : <div className={styles.empty}>Nenhum pagamento registrado ainda.</div>}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}

function Row({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className={styles.row}><span><strong>{label}</strong>{helper ? <small>{helper}</small> : null}</span><strong>{value}</strong></div>;
}
