"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveOrderWorkflowSettingsAction } from "@/features/orders/workflow-settings-actions";
import {
  deliveryWorkflowStages,
  pickupWorkflowStages,
  workflowStageLabels,
  type CustomWorkflowConfig,
  type OrderWorkflowMode,
  type WorkflowStage,
} from "@/features/orders/workflow-config";
import styles from "./workflow-settings.module.css";

type Props = { mode: OrderWorkflowMode; custom: CustomWorkflowConfig };

const modes: Array<{ value: OrderWorkflowMode; title: string; description: string; preview: string }> = [
  { value: "standard", title: "Completo", description: "Mostra todas as etapas operacionais e controles do gestor de pedidos.", preview: "Novo → A iniciar → Em preparo → Pronto → Entrega/retirada → Finalizado" },
  { value: "simplified", title: "Simplificado", description: "Menos colunas e decisões para uma operação rápida no balcão ou cozinha.", preview: "Iniciar → Pronto → Finalizados" },
  { value: "custom", title: "Personalizado", description: "Escolha quais checkpoints quer enxergar, separadamente para entrega e retirada.", preview: "Você escolhe os checkpoints visíveis" },
];

function WorkflowPicker({
  title,
  prefix,
  canonical,
  selected,
  onChange,
}: {
  title: string;
  prefix: "delivery" | "pickup";
  canonical: readonly WorkflowStage[];
  selected: WorkflowStage[];
  onChange: (next: WorkflowStage[]) => void;
}) {
  function toggle(stage: WorkflowStage) {
    if (stage === "new" || stage === "finished") return;
    onChange(canonical.filter((item) => item === "new" || item === "finished" || (item === stage ? !selected.includes(item) : selected.includes(item))));
  }

  return <section className={styles.picker}>
    <div className={styles.pickerHeader}>
      <div><strong>{title}</strong><p>Marque apenas os checkpoints que fazem sentido para esta operação.</p></div>
    </div>
    <div className={styles.stageList}>
      {canonical.map((stage, index) => {
        const locked = stage === "new" || stage === "finished";
        const checked = selected.includes(stage);
        return <label key={stage} className={styles.stage} data-selected={checked || undefined}>
          <input
            type="checkbox"
            name={`${prefix}:${stage}`}
            checked={checked}
            disabled={locked}
            onChange={() => toggle(stage)}
          />
          {locked ? <input type="hidden" name={`${prefix}:${stage}`} value="on" /> : null}
          <span className={styles.stageNumber}>{index + 1}</span>
          <span><strong>{workflowStageLabels[stage]}</strong><small>{locked ? "Obrigatório" : checked ? "Visível" : "Oculto no quadro"}</small></span>
        </label>;
      })}
    </div>
    <div className={styles.preview} aria-label={`Prévia do fluxo de ${title.toLowerCase()}`}>
      {selected.map((stage, index) => <span key={stage} className={styles.previewItem}>
        <b>{workflowStageLabels[stage]}</b>{index < selected.length - 1 ? <i aria-hidden>→</i> : null}
      </span>)}
    </div>
  </section>;
}

export function OrderWorkflowSettingsForm({ mode: initialMode, custom }: Props) {
  const [mode, setMode] = useState<OrderWorkflowMode>(initialMode);
  const [delivery, setDelivery] = useState<WorkflowStage[]>([...custom.delivery]);
  const [pickup, setPickup] = useState<WorkflowStage[]>([...custom.pickup]);

  return <form action={saveOrderWorkflowSettingsAction} className={styles.form}>
    <fieldset className={styles.modeGrid}>
      <legend className="sr-only">Escolha o modo do fluxo de pedidos</legend>
      {modes.map((option) => <label key={option.value} className={styles.modeCard} data-selected={mode === option.value || undefined}>
        <input type="radio" name="mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} />
        <span className={styles.modeText}><strong>{option.title}</strong><small>{option.description}</small><em>{option.preview}</em></span>
      </label>)}
    </fieldset>

    {mode === "custom" ? <div className={styles.customArea}>
      <div className={styles.notice}><strong>Personalização segura</strong><span>Ocultar um checkpoint muda o que aparece no quadro. As regras internas de pagamento, produção e entrega continuam sendo respeitadas.</span></div>
      <WorkflowPicker title="Entrega" prefix="delivery" canonical={deliveryWorkflowStages} selected={delivery} onChange={setDelivery} />
      <WorkflowPicker title="Retirada" prefix="pickup" canonical={pickupWorkflowStages} selected={pickup} onChange={setPickup} />
    </div> : null}

    <footer className={styles.footer}>
      <div><strong>Modo selecionado: {modes.find((item) => item.value === mode)?.title}</strong><p>A alteração vale somente para esta unidade.</p></div>
      <Button type="submit">Salvar fluxo de pedidos</Button>
    </footer>
  </form>;
}
