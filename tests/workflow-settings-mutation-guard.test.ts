import { describe, expect, it } from "vitest";
import type { CustomWorkflowConfig } from "@/features/orders/workflow-config";
import {
  hasWorkflowStructureChanged,
  requireWorkflowSettingsMutationSource,
  type WorkflowStructureSnapshot,
} from "@/features/orders/workflow-settings-mutation";

const custom: CustomWorkflowConfig = {
  delivery: ["new", "preparing", "ready", "delivering", "finished"],
  pickup: ["new", "preparing", "ready", "awaiting_pickup", "finished"],
  quickFinish: false,
};

describe("workflow settings structural mutation guard", () => {
  it.each(["user_action", "migration", "admin"])("accepts explicit structural source %s", (source) => {
    expect(requireWorkflowSettingsMutationSource(source)).toBe(source);
  });

  it("rejects provider_event as a structural configuration source", () => {
    expect(() => requireWorkflowSettingsMutationSource("provider_event"))
      .toThrow('Workflow structural configuration cannot be mutated from source "provider_event".');
  });

  it("detects mode, lane and quick-finish changes but ignores identical workflow snapshots", () => {
    const before: WorkflowStructureSnapshot = { mode: "standard", custom };

    expect(hasWorkflowStructureChanged(before, before)).toBe(false);
    expect(hasWorkflowStructureChanged(before, { mode: "simplified", custom })).toBe(true);
    expect(hasWorkflowStructureChanged(before, {
      mode: "standard",
      custom: {
        delivery: ["new", "preparing", "ready", "finished"],
        pickup: [...custom.pickup],
        quickFinish: false,
      },
    })).toBe(true);
    expect(hasWorkflowStructureChanged(before, {
      mode: "standard",
      custom: { ...custom, quickFinish: true },
    })).toBe(true);
  });
});
