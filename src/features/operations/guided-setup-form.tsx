"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveGuidedOperationalSetupAction } from "@/features/operations/guided-setup-actions";
import type { OperationalSettings } from "@/server/stores/operational-settings-service";
import styles from "@/app/(app)/configuracoes/operacao/operacao-config.module.css";

export function GuidedSetupForm({ settings, deliveryAvailable, canManage }: { settings: OperationalSettings; deliveryAvailable: boolean; canManage: boolean }) {
  const [workflow, setWorkflow] = useState(settings.ordersWorkflowMode);
  const [acceptance, setAcceptance] = useState(settings.ordersAutoAccept ? "automatic" : "manual");
  const [handoff, setHandoff] = useState(settings.deliveriesAutoCreateWhenReady ? "automatic" : "manual");
  const effectiveAcceptance = workflow === "simplified" ? "automatic" : acceptance;
  return <form action={saveGuidedOperationalSetupAction} className={styles.form}>
    <fieldset disabled={!canManage}>
      <legend>1. Como sua equipe quer enxergar os pedidos?</legend>
      <Choice name="workflow" value="simplified" checked={workflow === "simplified"} onChange={() => setWorkflow("simplified")} title="Uma equipe, fluxo simples" badge="Recomendado" detail="Iniciar, Pronto e Finalizados. O sistema cuida das etapas técnicas por trás." />
      <Choice name="workflow" value="standard" checked={workflow === "standard"} onChange={() => setWorkflow("standard")} title="Setores e etapas separadas" detail="Confirmação, produção, expedição e entrega aparecem separadamente." />
    </fieldset>
    <fieldset disabled={!canManage}>
      <legend>2. Quem confirma um pedido novo?</legend>
      <Choice name="acceptance" value="automatic" checked={effectiveAcceptance === "automatic"} onChange={() => setAcceptance("automatic")} title="O PedeAqui confirma automaticamente" badge={workflow === "simplified" ? "Necessário no fluxo simples" : "Mais rápido"} detail="Pedidos elegíveis entram direto na fila. Exceções continuam visíveis." disabled={workflow === "simplified"} />
      <Choice name="acceptance" value="manual" checked={effectiveAcceptance === "manual"} onChange={() => setAcceptance("manual")} title="Uma pessoa confirma" detail="Cada pedido aguarda aceite. Útil quando estoque e capacidade variam muito." disabled={workflow === "simplified"} />
    </fieldset>
    <fieldset disabled={!canManage || !deliveryAvailable}>
      <legend>3. Como tratar pedidos de entrega?</legend>
      {deliveryAvailable ? <>
        <Choice name="deliveryHandoff" value="manual" checked={handoff === "manual"} onChange={() => setHandoff("manual")} title="Eu administro o motoboy" badge="Mais simples" detail="O pedido continua sendo delivery, mas não cria trabalho automático para o motoboy." />
        <Choice name="deliveryHandoff" value="automatic" checked={handoff === "automatic"} onChange={() => setHandoff("automatic")} title="Enviar ao módulo de entregas" detail="Quando ficar pronto, o pedido segue para a central de entregas." />
      </> : <div className={styles.moduleOff}><strong>Entrega gerenciada manualmente</strong><p>O cliente ainda pode pedir delivery. Como o módulo está desligado, nenhuma etapa de motoboy será exigida — exatamente o cenário da Dona Maria.</p></div>}
    </fieldset>
    <section className={styles.preview} aria-live="polite"><strong>Como ficará na prática</strong><p>Pedido novo → {effectiveAcceptance === "automatic" ? "entra automaticamente" : "aguarda sua confirmação"} → {workflow === "simplified" ? "Iniciar → Pronto → Finalizado" : "segue todas as etapas"}{deliveryAvailable ? ` → entrega ${handoff === "automatic" ? "vai para a central" : "fica sob seu controle"}` : " → delivery sem gestão de motoboy"}.</p></section>
    {canManage ? <Button type="submit" loadingLabel="Salvando configuração…">Salvar este fluxo</Button> : <p className={styles.readOnly}>Você pode revisar o fluxo, mas somente o responsável pela loja pode alterá-lo.</p>}
    <small>Esta alteração não ativa módulos, não muda seu plano e pode ser revertida a qualquer momento.</small>
  </form>;
}

function Choice({ name, value, checked, onChange, title, detail, badge, disabled = false }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; detail: string; badge?: string; disabled?: boolean }) {
  return <label className={styles.choice} data-checked={checked}><input type="radio" name={name} value={value} checked={checked} onChange={onChange} disabled={disabled} /><span><strong>{title}{badge ? <em>{badge}</em> : null}</strong><small>{detail}</small></span></label>;
}
