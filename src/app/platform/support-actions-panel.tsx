import { randomUUID } from "node:crypto";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import {
  supportAcceptingOrdersAction,
  supportDeliveryAction,
  supportFulfillmentAction,
  supportHourAction,
  supportMenuPublishedAction,
  supportPaymentAction,
  supportStoreStatusAction,
} from "@/features/platform-support/actions";
import { PlatformSupportReadService } from "@/server/platform/platform-support-read-service";
import styles from "./platform.module.css";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const paymentLabels: Record<string, string> = { cash: "Dinheiro", pix: "PIX", credit_card: "Cartão de crédito", debit_card: "Cartão de débito" };

export async function SupportActionsPanel({ organizationId, storeId }: { organizationId: string; storeId: string }) {
  const state = await PlatformSupportReadService.load(organizationId, storeId);
  if (state.role !== "super_admin" || !state.config) {
    return (
      <section className={styles.section}>
        <div className={styles.sectionHeader}><div><h2>Central de ações de suporte</h2><p>Você pode diagnosticar esta unidade. Alterações comerciais exigem permissão elevada.</p></div></div>
        <p className={styles.advancedNote}>O perfil de suporte permanece somente leitura para configurações que alteram a operação do restaurante.</p>
      </section>
    );
  }

  const config = state.config;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div><h2>Central de ações de suporte</h2><p>Correções controladas, com motivo, protocolo, idempotência e registro de antes/depois.</p></div>
        <span className={styles.pill} data-tone="warn">Super admin</span>
      </div>
      <p className={styles.advancedNote}>Use apenas valores confirmados pelo restaurante. Esta central não altera status financeiro nem força estados de pedidos.</p>

      <div className={styles.supportGrid}>
        <Action title="Situação da unidade" current={`Atual: ${config.storeStatus}`}>
          <form action={supportStoreStatusAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label>Situação desejada<select className={styles.field} name="status" defaultValue={config.storeStatus}><option value="active">Ativa</option><option value="temporarily_closed">Fechada temporariamente</option><option value="inactive">Inativa</option></select></label>
            <PendingSubmitButton className={styles.button}>Aplicar alteração auditada</PendingSubmitButton>
          </form>
        </Action>

        <Action title="Publicação do cardápio" current={`Atual: ${config.menu?.active ? "Publicado" : "Despublicado"}`}>
          <form action={supportMenuPublishedAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label>Alterar para<select className={styles.field} name="active" defaultValue={config.menu?.active ? "true" : "false"}><option value="true">Publicado</option><option value="false">Despublicado</option></select></label>
            <PendingSubmitButton className={styles.button}>Aplicar alteração auditada</PendingSubmitButton>
          </form>
        </Action>

        <Action title="Recebimento de pedidos" current={`Atual: ${config.menu?.accepting_orders ? "Aceitando" : "Pausado"}`}>
          <form action={supportAcceptingOrdersAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label>Alterar para<select className={styles.field} name="accepting" defaultValue={config.menu?.accepting_orders ? "true" : "false"}><option value="true">Aceitar pedidos</option><option value="false">Pausar pedidos</option></select></label>
            <label>Motivo da pausa, quando aplicável<input className={styles.field} name="pauseReason" defaultValue={config.menu?.pause_reason ?? ""} maxLength={240} /></label>
            <PendingSubmitButton className={styles.button}>Aplicar alteração auditada</PendingSubmitButton>
          </form>
        </Action>

        <Action title="Entrega e retirada" current={`Atual: ${config.menu?.allow_delivery ? "Entrega " : ""}${config.menu?.allow_pickup ? "Retirada" : ""}`.trim() || "nenhuma modalidade"}>
          <form action={supportFulfillmentAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label><input type="checkbox" name="allowDelivery" defaultChecked={Boolean(config.menu?.allow_delivery)} /> Permitir entrega</label>
            <label><input type="checkbox" name="allowPickup" defaultChecked={Boolean(config.menu?.allow_pickup)} /> Permitir retirada</label>
            <PendingSubmitButton className={styles.button}>Aplicar alteração auditada</PendingSubmitButton>
          </form>
        </Action>

        <Action title="Meios de pagamento" current={`Ativos: ${config.payments.filter((item) => item.enabled).map((item) => paymentLabels[item.method] ?? item.method).join(" · ") || "nenhum"}`}>
          <form action={supportPaymentAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label>Meio<select className={styles.field} name="method" defaultValue="cash"><option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option></select></label>
            <label>Ação<select className={styles.field} name="enabled" defaultValue="true"><option value="true">Habilitar</option><option value="false">Desabilitar</option></select></label>
            <PendingSubmitButton className={styles.button}>Aplicar alteração auditada</PendingSubmitButton>
          </form>
        </Action>

        <Action title="Adicionar horário" current={`${config.hours.filter((item) => item.active).length} período(s) ativo(s)`}>
          <form action={supportHourAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label>Dia<select className={styles.field} name="weekday" defaultValue="1">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            <div className={styles.formGrid}><label>Abertura<input className={styles.field} name="opensAt" type="time" required /></label><label>Fechamento<input className={styles.field} name="closesAt" type="time" required /></label></div>
            <label><input type="checkbox" name="closesNextDay" /> Fecha no dia seguinte</label>
            <PendingSubmitButton className={styles.button}>Adicionar horário confirmado</PendingSubmitButton>
          </form>
        </Action>

        <Action title="Configuração de entrega" current={config.delivery ? `Atual: ${config.delivery.enabled ? "ativa" : "inativa"} · ${(config.delivery.default_fee_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "Ainda não configurada"}>
          <form action={supportDeliveryAction} className={styles.detailsBody}>
            <Common organizationId={organizationId} storeId={storeId} />
            <label><input type="checkbox" name="enabled" defaultChecked={config.delivery?.enabled ?? true} /> Entrega ativa</label>
            <label>Cálculo<select className={styles.field} name="feeMode" defaultValue={config.delivery?.fee_mode ?? "neighborhood"}><option value="default">Taxa padrão</option><option value="neighborhood">Por bairro/região</option></select></label>
            <label>Taxa padrão (R$)<input className={styles.field} name="defaultFeeReais" type="number" min="0" step="0.01" defaultValue={((config.delivery?.default_fee_cents ?? 0) / 100).toFixed(2)} required /></label>
            <div className={styles.formGrid}><label>Prazo mínimo<input className={styles.field} name="estimatedMinMinutes" type="number" min="0" max="1440" defaultValue={config.delivery?.estimated_min_minutes ?? 30} required /></label><label>Prazo máximo<input className={styles.field} name="estimatedMaxMinutes" type="number" min="0" max="1440" defaultValue={config.delivery?.estimated_max_minutes ?? 60} required /></label></div>
            <label><input type="checkbox" name="requireNeighborhoodMatch" defaultChecked={config.delivery?.require_neighborhood_match ?? true} /> Exigir bairro/região cadastrada</label>
            <PendingSubmitButton className={styles.button}>Aplicar valores confirmados</PendingSubmitButton>
          </form>
        </Action>
      </div>
    </section>
  );
}

function Action({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  return <details className={styles.details}><summary>{title}</summary><div className={styles.detailsBody}><p className={styles.advancedNote}>{current}</p>{children}</div></details>;
}

function Common({ organizationId, storeId }: { organizationId: string; storeId: string }) {
  return <><input type="hidden" name="organizationId" value={organizationId} /><input type="hidden" name="storeId" value={storeId} /><input type="hidden" name="idempotencyKey" value={`support:${randomUUID()}`} /><label>Motivo da intervenção<input className={styles.field} name="reason" minLength={5} maxLength={500} required placeholder="Ex.: ajuste confirmado pelo responsável da unidade" /></label><label>Protocolo/chamado<input className={styles.field} name="protocol" minLength={3} maxLength={120} required placeholder="Ex.: SUP-2026-001" /></label></>;
}
