import type { CustomWorkflowConfig, OrderWorkflowMode } from "@/features/orders/workflow-config";

export const WORKFLOW_SETTINGS_MUTATION_SOURCES = ["user_action", "migration", "admin"] as const;
export type WorkflowSettingsMutationSource = (typeof WORKFLOW_SETTINGS_MUTATION_SOURCES)[number];

export type WorkflowStructureSnapshot = {
  mode: OrderWorkflowMode;
  custom: CustomWorkflowConfig;
};

export function requireWorkflowSettingsMutationSource(source: string): WorkflowSettingsMutationSource {
  if (!WORKFLOW_SETTINGS_MUTATION_SOURCES.includes(source as WorkflowSettingsMutationSource)) {
    throw new Error(`Workflow structural configuration cannot be mutated from source "${source}".`);
  }
  return source as WorkflowSettingsMutationSource;
}

export function hasWorkflowStructureChanged(
  before: WorkflowStructureSnapshot,
  after: WorkflowStructureSnapshot,
) {
  if (before.mode !== after.mode) return true;
  if (before.custom.quickFinish !== after.custom.quickFinish) return true;
  if (before.custom.delivery.length !== after.custom.delivery.length) return true;
  if (before.custom.pickup.length !== after.custom.pickup.length) return true;

  return before.custom.delivery.some((stage, index) => stage !== after.custom.delivery[index])
    || before.custom.pickup.some((stage, index) => stage !== after.custom.pickup[index]);
}
