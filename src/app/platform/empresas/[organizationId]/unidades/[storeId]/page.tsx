import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformRestaurant360Service } from "@/server/platform/platform-restaurant-360-service";
import styles from "@/app/platform/platform.module.css";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const orderLabels: Record<string, string> = { pending_confirmation: "Aguardando confirmação", confirmed: "Confirmado", rejected: "Rejeitado", canceled: "Cancelado", completed: "Concluído" };
const paymentLabels: Record<string, string> = { pending: "Pagamento pendente", authorized: "Autorizado", paid: "Pago", failed: "Falhou", partially_refunded: "Estorno parcial", refunded: "Estornado" };
const productionLabels: Record<string, string> = { pending_confirmation: "Aguardando aceite", queued: "Na fila", preparing: "Em preparo", ready: "Pronto", canceled: "Cancelado", not_required: "Não necessário" };
const fulfillmentLabels: Record<string, string> = { pending: "Pendente", awaiting_assignment: "Aguardando entregador", assigned: "Atribuído", picked_up: "Coletado", out_for_delivery: "Em rota", delivered: "Entregue", awaiting_pickup: "Aguardando retirada", picked_up_by_customer: "Retirado", served: "Servido", canceled: "Cancelado", not_required: "Não necessário" };

function statusLabel(status: string) {
  if (status === "active") return "Ativa";
  if (status === "temporarily_closed") return "Fechada temporariamente";
  if (status === "inactive") return "Inativa";
  return status;
}

function tone(status: string) {
  return status === "active" ? "good" : status === "temporarily_closed" ? "warn" : "danger";
}

export default async function Restaurant360Page({ params }: { params: Promise<{ organizationId: string; storeId: string }> }) {
  const { organizationId, storeId } = await params;
  const data = await PlatformRestaurant360Service.load(organizationId, storeId);
  if (!data) notFound();

  const readinessTone = data.readiness.ready ? "good" : "danger";
  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}><Link href="/platform#empresas">← Empresas e unidades</Link><span>/</span><span>{data.organization.name}</span><span>/</span><strong>{data.store.name}</strong></div>

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>VISÃO 360° · RESTAURANTE</p>
          <h1>{data.store.name}</h1>
          <p>{data.organization.name} · {data.store.city && data.store.state ? `${data.store.city} / ${data.store.state}` : "Localização não informada"} · /m/{data.store.slug}</p>
        </div>
        <div className={styles.heroBadges}>
          <span className={styles.pill} data-tone={tone(data.store.status)}>{statusLabel(data.store.status)}</span>
          <span className={styles.pill} data-tone={readinessTone}>{data.readiness.ready ? "Pronta para vender" : `${data.readiness.blockers} bloqueio(s)`}</span>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Resumo do restaurante">
        <Metric label="Produtos disponíveis" value={data.commercial.productCount} helper="ativos para venda" />
        <Metric label="Pedidos recentes" value={data.recentOrders.length} helper="últimos registros" />
        <Metric label="Usuários ativos" value={data.access.activeMembers} helper={`${data.access.pendingInvites} convite(s) pendente(s)`} />
        <Metric label="Pagamentos" value={data.commercial.paymentMethods.length} helper={data.commercial.paymentMethods.join(" · ") || "nenhum habilitado"} />
        <Metric label="Operação agora" value={data.readiness.openNow ? "Aberta" : "Fechada"} helper={`${data.commercial.activeHours} horário(s) ativo(s)`} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div><h2>Prontidão comercial</h2><p>Diagnóstico determinístico do que impede ou permite esta unidade receber pedidos agora.</p></div>
          <span className={styles.pill} data-tone={readinessTone}>{data.readiness.ready ? "Tudo certo" : "Ação necessária"}</span>
        </div>
        <div className={styles.readinessGrid}>
          {data.readiness.checks.map((check) => (
            <article key={check.key} className={styles.readinessCard} data-tone={check.tone}>
              <div className={styles.cardTop}><strong>{check.label}</strong><span className={styles.pill} data-tone={check.tone}>{check.blocking ? "Bloqueando vendas" : check.tone === "good" ? "OK" : "Atenção"}</span></div>
              <p>{check.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Configuração operacional</h2><p>Resumo suficiente para suporte identificar lacunas sem abrir banco ou terminal.</p></div></div>
        <div className={styles.supportGrid}>
          <InfoCard title="Cardápio e venda" lines={[`${data.commercial.productCount} produto(s) disponível(is)`, `${data.commercial.activeHours} período(s) de funcionamento`, data.readiness.openNow ? "Dentro do horário agora" : "Fora do horário agora"]} />
          <InfoCard title="Entrega e retirada" lines={[data.commercial.deliveryEnabled ? "Entrega configurada" : "Entrega não configurada/indisponível", `${data.commercial.neighborhoods} região(ões) ativa(s)`, "As regras comerciais permanecem sob controle do restaurante"]} />
          <InfoCard title="Comunicação" lines={[data.commercial.whatsappHealthy ? "WhatsApp conectado" : "WhatsApp exige atenção", `${data.commercial.printAgentsOnline} agente(s) de impressão online`, `${data.commercial.printers} impressora(s) ativa(s)`]} />
          <InfoCard title="Assinatura" lines={[data.subscription?.planName ?? "Sem plano identificado", data.subscription ? `Situação: ${data.subscription.status}` : "Sem assinatura encontrada", data.subscription?.current_period_end ? `Período até ${dateTime.format(new Date(data.subscription.current_period_end))}` : "Período não informado"]} />
          <InfoCard title="Equipe" lines={[`${data.access.activeMembers} membro(s) ativo(s)`, `${data.access.pendingInvites} convite(s) pendente(s)`, "Detalhes de acesso ficam restritos ao suporte autorizado"]} />
          <InfoCard title="Identificação" lines={[`Slug público: ${data.store.slug}`, `Fuso: ${data.store.timezone}`, data.store.is_primary ? "Unidade principal" : "Unidade adicional"]} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Pedidos recentes</h2><p>Timeline operacional sem nome, telefone, endereço ou conteúdo do pedido.</p></div></div>
        <div className={styles.order360List}>
          {data.recentOrders.map((order) => (
            <article key={order.id} className={styles.order360Row}>
              <div><strong>Pedido #{order.display_number}</strong><span>{dateTime.format(new Date(order.created_at))}</span></div>
              <div className={styles.order360States}>
                <span>{orderLabels[order.order_status] ?? order.order_status}</span>
                <span>{paymentLabels[order.payment_status] ?? order.payment_status}</span>
                <span>{productionLabels[order.production_status] ?? order.production_status}</span>
                <span>{fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status}</span>
              </div>
            </article>
          ))}
          {data.recentOrders.length === 0 ? <div className={styles.empty}>Nenhum pedido encontrado nesta unidade.</div> : null}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Atividade de suporte</h2><p>Últimas alterações auditadas da unidade, sem conteúdo sensível.</p></div></div>
        <div className={styles.healthList}>
          {data.recentAudit.map((event) => <div key={event.id} className={styles.healthRow}><span><strong>{event.action}</strong><small>{event.entity_type}</small></span><span>{dateTime.format(new Date(event.created_at))}{event.request_id ? ` · protocolo ${event.request_id}` : ""}</span></div>)}
          {data.recentAudit.length === 0 ? <div className={styles.empty}>Nenhuma intervenção recente registrada.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return <article className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>;
}

function InfoCard({ title, lines }: { title: string; lines: string[] }) {
  return <article className={styles.supportCard}><strong>{title}</strong>{lines.map((line) => <span key={line}>{line}</span>)}</article>;
}
