"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveGuidedOperationalSetupAction } from "@/features/operations/guided-setup-actions";
import type { OperationalSettings } from "@/server/stores/operational-settings-service";
import { resolveDeliveryOperationLevel, type DeliveryOperationLevel } from "@/modules/manual-delivery";
import type { ModuleKey } from "@/modules/module-catalog";
import styles from "@/app/(app)/configuracoes/operacao/operacao-config.module.css";

export function GuidedSetupForm({ settings, deliveryAvailable, driverAvailable, canManage }: { settings: OperationalSettings; deliveryAvailable: boolean; driverAvailable: boolean; canManage: boolean }) {
  const [workflow, setWorkflow] = useState(settings.ordersWorkflowMode);
  const [acceptance, setAcceptance] = useState(settings.ordersAutoAccept ? "automatic" : "manual");
  const modules = new Set<ModuleKey>([...(deliveryAvailable ? ["deliveries" as const] : []), ...(driverAvailable ? ["driver" as const] : [])]);
  const [deliveryLevel, setDeliveryLevel] = useState<DeliveryOperationLevel>(() => resolveDeliveryOperationLevel(settings.deliveryOperationLevel, modules));
  const [paymentPolicy, setPaymentPolicy] = useState(settings.paymentCompletionPolicy ?? "strict");
  const effectiveAcceptance = workflow === "simplified" ? "automatic" : acceptance;
  return <form action={saveGuidedOperationalSetupAction} className={styles.form}>
    <fieldset disabled={!canManage}>
      <legend>1. Como sua equipe quer enxergar os pedidos?</legend>
      <Choice name="workflow" value="simplified" checked={workflow === "simplified"} onChange={() => setWorkflow("simplified")} title="Uma equipe, fluxo simples" badge="Recomendado" detail="Iniciar, Pronto e Finalizados. O sistema cuida das etapas técnicas por trás." />
      <Choice name="workflow" value="standard" checked={workflow === "standard"} onChange={() => setWorkflow("standard")} title="Setores e etapas separadas" detail="Confirmação, produção, expedição e entrega aparecem separadamente." />
    </fieldset>
    <fieldset disabled={!canManage}>
      <legend>4. O que fazer quando a entrega termina e o pagamento ainda está pendente?</legend>
      <Choice name="paymentPolicy" value="strict" checked={paymentPolicy === "strict"} onChange={() => setPaymentPolicy("strict")} title="Manter na operação" detail="O pedido só sai do painel depois que o pagamento for confirmado." />
      <Choice name="paymentPolicy" value="flexible" checked={paymentPolicy === "flexible"} onChange={() => setPaymentPolicy("flexible")} title="Enviar para pendências financeiras" detail="A entrega sai da operação, mas a dívida continua separada e visível no Financeiro." />
      <Choice name="paymentPolicy" value="quick_confirmation" checked={paymentPolicy === "quick_confirmation"} onChange={() => setPaymentPolicy("quick_confirmation")} title="Perguntar ao finalizar" badge="Mais rápido" detail="Ao finalizar, o PedeAqui pergunta se o pagamento foi recebido antes de dar baixa." />
    </fieldset>
    <fieldset disabled={!canManage}>
      <legend>2. Quem confirma um pedido novo?</legend>
      <Choice name="acceptance" value="automatic" checked={effectiveAcceptance === "automatic"} onChange={() => setAcceptance("automatic")} title="O PedeAqui confirma automaticamente" badge={workflow === "simplified" ? "Necessário no fluxo simples" : "Mais rápido"} detail="Pedidos elegíveis entram direto na fila. Exceções continuam visíveis." disabled={workflow === "simplified"} />
      <Choice name="acceptance" value="manual" checked={effectiveAcceptance === "manual"} onChange={() => setAcceptance("manual")} title="Uma pessoa confirma" detail="Cada pedido aguarda aceite. Útil quando estoque e capacidade variam muito." disabled={workflow === "simplified"} />
    </fieldset>
    <fieldset disabled={!canManage}>
      <legend>3. Até onde o PedeAqui participa da entrega?</legend>
      <Choice name="deliveryLevel" value="manual" checked={deliveryLevel === "manual"} onChange={() => setDeliveryLevel("manual")} title="Entrega manual" badge="Mais simples" detail="O restaurante informa que saiu e finaliza. Motoboy não acessa o sistema." />
      <Choice name="deliveryLevel" value="dispatch_simple" checked={deliveryLevel === "dispatch_simple"} onChange={() => setDeliveryLevel("dispatch_simple")} title="Despacho simples" detail="Organiza pedidos prontos para despacho, sem exigir aplicativo do motoboy." disabled={!deliveryAvailable} />
      <Choice name="deliveryLevel" value="driver_connected" checked={deliveryLevel === "driver_connected"} onChange={() => setDeliveryLevel("driver_connected")} title="Entregador conectado" detail="O restaurante atribui e o motoboy atualiza a rota pelo PedeAqui." disabled={!deliveryAvailable || !driverAvailable} />
      <Choice name="deliveryLevel" value="advanced" checked={deliveryLevel === "advanced"} onChange={() => setDeliveryLevel("advanced")} title="Gestão avançada" detail="Inclui retirada livre, rastreamento e alertas da rota." disabled={!deliveryAvailable || !driverAvailable} />
      {!deliveryAvailable ? <div className={styles.moduleOff}><strong>Somente entrega manual está disponível</strong><p>O cliente ainda pode pedir delivery; nenhuma etapa de motoboy será exigida.</p></div> : null}
    </fieldset>
    <section className={styles.preview} aria-live="polite"><strong>Como ficará na prática</strong><p>Pedido novo → {effectiveAcceptance === "automatic" ? "entra automaticamente" : "aguarda sua confirmação"} → {workflow === "simplified" ? "Iniciar → Pronto" : "segue todas as etapas"} → {deliveryLevel === "manual" ? "Saiu para entrega → Finalizar, sem ação do motoboy" : deliveryLevel === "dispatch_simple" ? "Despachar, sem login do motoboy" : deliveryLevel === "driver_connected" ? "Atribuir → motoboy atualiza a entrega" : "gestão completa da rota"}.</p></section>
    {canManage ? <Button type="submit" loadingLabel="Salvando configuração…">Salvar este fluxo</Button> : <p className={styles.readOnly}>Você pode revisar o fluxo, mas somente o responsável pela loja pode alterá-lo.</p>}
    <small>Esta alteração não ativa módulos, não muda seu plano e pode ser revertida a qualquer momento.</small>
  </form>;
}

function Choice({ name, value, checked, onChange, title, detail, badge, disabled = false }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; detail: string; badge?: string; disabled?: boolean }) {
  return <label className={styles.choice} data-checked={checked}><input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} /><span><strong>{title}{badge ? <em>{badge}</em> : null}</strong><small>{detail}</small></span></label>;
}
