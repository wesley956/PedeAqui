import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  customWorkflowConfigSchema,
  defaultCustomWorkflowConfig,
  deliveryWorkflowStages,
  foldStageToVisible,
  workflowModeSchema,
} from "@/features/orders/workflow-config";

const settingsPage = readFileSync("src/app/(app)/configuracoes/page.tsx", "utf8");
const orderPage = readFileSync("src/app/(app)/pedidos/page.tsx", "utf8");
const settingsForm = readFileSync("src/features/orders/order-workflow-settings-form.tsx", "utf8");
const service = readFileSync("src/server/orders/order-workflow-settings-service.ts", "utf8");
const migration = readFileSync("supabase/sql/145_configurable_order_workflow.sql", "utf8");

describe("configurable order workflow #807", () => {
  it("accepts the three official modes", () => {
    expect(workflowModeSchema.parse("standard")).toBe("standard");
    expect(workflowModeSchema.parse("simplified")).toBe("simplified");
    expect(workflowModeSchema.parse("custom")).toBe("custom");
    expect(() => workflowModeSchema.parse("anything")).toThrow();
  });

  it("validates allowlisted ordered delivery and pickup stages", () => {
    expect(customWorkflowConfigSchema.parse(defaultCustomWorkflowConfig)).toEqual(defaultCustomWorkflowConfig);
    expect(() => customWorkflowConfigSchema.parse({ delivery: ["new", "finished", "ready"], pickup: ["new", "finished"] })).toThrow();
    expect(() => customWorkflowConfigSchema.parse({ delivery: ["new", "made_up", "finished"], pickup: ["new", "finished"] })).toThrow();
    expect(() => customWorkflowConfigSchema.parse({ delivery: ["new", "ready", "ready", "finished"], pickup: ["new", "finished"] })).toThrow();
  });

  it("folds hidden operational states into the closest previous visible checkpoint", () => {
    const selected = ["new", "ready", "finished"] as const;
    expect(foldStageToVisible("preparing", selected, deliveryWorkflowStages)).toBe("new");
    expect(foldStageToVisible("delivering", selected, deliveryWorkflowStages)).toBe("ready");
  });

  it("exposes the settings entry and separate delivery/pickup previews", () => {
    expect(settingsPage).toContain('title: "Fluxo de pedidos"');
    expect(settingsPage).toContain('href: "/configuracoes/fluxo-pedidos"');
    expect(settingsForm).toContain('title: "Completo"');
    expect(settingsForm).toContain('title: "Simplificado"');
    expect(settingsForm).toContain('title: "Personalizado"');
    expect(settingsForm).toContain('title="Entrega"');
    expect(settingsForm).toContain('title="Retirada"');
    expect(settingsForm).toContain("Personalização segura");
  });

  it("keeps custom workflow tenant scoped and routed through safe board behavior", () => {
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).toContain("PERMISSIONS.STORES_MANAGE");
    expect(orderPage).toContain("CustomOrderWorkflowBoard");
    expect(orderPage).toContain('workflowMode === "custom"');
  });

  it("extends the database without replacing domain state machines", () => {
    expect(migration).toContain("orders_custom_workflow jsonb");
    expect(migration).toContain("'standard', 'simplified', 'custom'");
    expect(migration).toContain("Não substitui nem enfraquece as máquinas de estado");
  });
});
