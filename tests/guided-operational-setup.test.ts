import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("guided operational setup #884", () => {
  it("keeps the simplified flow dependency explicit", () => {
    const service = read("src/server/stores/operational-settings-service.ts");
    expect(service).toContain('settings.ordersWorkflowMode === "simplified" && !settings.ordersAutoAccept');
    expect(service).toContain("O fluxo simplificado exige autoaceite");
  });

  it("does not activate modules or replace the authoritative settings model", () => {
    const action = read("src/features/operations/guided-setup-actions.ts");
    expect(action).toContain("OperationalSettingsService.loadCurrent");
    expect(action).toContain("...current.settings");
    expect(action).not.toContain("ModuleAccessService");
    expect(action).not.toContain("store_modules");
  });

  it("explains delivery without driver management", () => {
    const form = read("src/features/operations/guided-setup-form.tsx");
    expect(form).toContain("O cliente ainda pode pedir delivery");
    expect(form).toContain("nenhuma etapa de motoboy será exigida");
  });
});
