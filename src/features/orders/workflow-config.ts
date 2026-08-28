import { z } from "zod";

export const workflowModeSchema = z.enum(["standard", "simplified", "custom"]);
export type OrderWorkflowMode = z.infer<typeof workflowModeSchema>;

export const deliveryWorkflowStages = ["new", "preparing", "ready", "delivering", "finished"] as const;
export const pickupWorkflowStages = ["new", "preparing", "ready", "awaiting_pickup", "finished"] as const;

export type DeliveryWorkflowStage = (typeof deliveryWorkflowStages)[number];
export type PickupWorkflowStage = (typeof pickupWorkflowStages)[number];
export type WorkflowStage = DeliveryWorkflowStage | PickupWorkflowStage;

export const workflowStageLabels: Record<WorkflowStage, string> = {
  new: "Novo",
  preparing: "Em preparo",
  ready: "Pronto",
  delivering: "Saiu para entrega",
  awaiting_pickup: "Aguardando retirada",
  finished: "Finalizado",
};

const deliveryStageSchema = z.enum(deliveryWorkflowStages);
const pickupStageSchema = z.enum(pickupWorkflowStages);

function orderedUnique<T extends string>(canonical: readonly T[]) {
  return (value: T[], ctx: z.RefinementCtx) => {
    if (new Set(value).size !== value.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Etapas duplicadas não são permitidas." });
      return;
    }
    if (value[0] !== "new" || value[value.length - 1] !== "finished") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Novo deve ser a primeira etapa e Finalizado a última." });
      return;
    }
    const indexes = value.map((stage) => canonical.indexOf(stage));
    if (indexes.some((index, position) => {
      const previous = position > 0 ? indexes[position - 1] : undefined;
      return previous !== undefined && index <= previous;
    })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "As etapas precisam seguir a ordem operacional." });
    }
  };
}

export const customWorkflowConfigSchema = z.object({
  delivery: z.array(deliveryStageSchema).min(2).max(deliveryWorkflowStages.length).superRefine(orderedUnique(deliveryWorkflowStages)),
  pickup: z.array(pickupStageSchema).min(2).max(pickupWorkflowStages.length).superRefine(orderedUnique(pickupWorkflowStages)),
});

export type CustomWorkflowConfig = z.infer<typeof customWorkflowConfigSchema>;

export const defaultCustomWorkflowConfig: CustomWorkflowConfig = {
  delivery: [...deliveryWorkflowStages],
  pickup: [...pickupWorkflowStages],
};

export function parseCustomWorkflowConfig(value: unknown): CustomWorkflowConfig {
  const result = customWorkflowConfigSchema.safeParse(value);
  return result.success ? result.data : defaultCustomWorkflowConfig;
}

export function selectedStagesFromForm(formData: FormData, prefix: "delivery" | "pickup") {
  const canonical = prefix === "delivery" ? deliveryWorkflowStages : pickupWorkflowStages;
  return canonical.filter((stage) => stage === "new" || stage === "finished" || formData.get(`${prefix}:${stage}`) === "on");
}

export function foldStageToVisible<T extends string>(stage: T, selected: readonly T[], canonical: readonly T[]): T {
  if (selected.includes(stage)) return stage;
  const currentIndex = canonical.indexOf(stage);
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = canonical[index];
    if (candidate !== undefined && selected.includes(candidate)) return candidate;
  }
  return selected[0] ?? canonical[0] ?? stage;
}
