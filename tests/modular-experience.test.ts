import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { moduleKeyForPathname } from "@/modules/module-routing";
import { productionStatusLabelForBusiness } from "@/modules/business-vocabulary";
import { selectEasyModuleKeys } from "@/modules/user-experience";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("modular experience [357-361]", () => {
  it("maps deep links to the most specific module", () => {
    expect(moduleKeyForPathname("/configuracoes/conversas")).toBe("conversations");
    expect(moduleKeyForPathname("/configuracoes/modulos")).toBe("settings");
    expect(moduleKeyForPathname("/cardapio/produtos/novo")).toBe("catalog");
    expect(moduleKeyForPathname("/recurso-indisponivel")).toBeNull();
  });

  it("easy mode never selects a module outside the already available set", () => {
    const available = ["orders", "customers"] as const;
    expect(selectEasyModuleKeys(available, ["cashier"])).toEqual(["orders", "customers"]);
  });

  it("keeps segment differences as presentation labels", () => {
    expect(productionStatusLabelForBusiness("preparing", "restaurant")).toBe("Em preparo");
    expect(productionStatusLabelForBusiness("preparing", "gas")).toBe("Separando");
    expect(productionStatusLabelForBusiness("ready", "gas")).toBe("Separado");
  });

  it("filters navigation from server-side module availability", () => {
    const source = read("src/server/access/navigation-access-service.ts");
    expect(source).toContain("ModuleAccessService.load(context)");
    expect(source).toContain("moduleSnapshot.availability[item.key].available");
    expect(source).toContain("moduleLabel(item.key, moduleSnapshot.businessType)");
  });

  it("guards authenticated deep links using the trusted proxy pathname", () => {
    expect(read("src/proxy.ts")).toContain('requestHeaders.set("x-pedeaqui-pathname"');
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("moduleKeyForPathname(pathname)");
    expect(layout).toContain("/recurso-indisponivel?module=");
  });

  it("uses atomic modular onboarding and central presets", () => {
    const action = read("src/features/onboarding/actions.ts");
    expect(action).toContain("modulesForPreset(");
    expect(action).toContain('supabase.rpc("bootstrap_organization_modular"');
    const sql = read("supabase/sql/106_modular_experience.sql");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("organization.modules.bootstrap");
  });

  it("persists Easy Mode server-side per user/store without localStorage", () => {
    const sql = read("supabase/sql/106_modular_experience.sql");
    const service = read("src/server/preferences/user-experience-service.ts");
    expect(sql).toContain("create table if not exists public.user_store_preferences");
    expect(service).toContain('experience_mode: mode');
    expect(service).not.toContain("localStorage");
  });

  it("requires preview before module changes in the settings experience", () => {
    const page = read("src/app/(app)/configuracoes/modulos/page.tsx");
    expect(page).toContain("ModuleConfigurationService.preview(");
    expect(page).toContain("ModuleConfigurationService.previewPreset(");
    expect(page).toContain("Desativar uma ferramenta nunca apaga o histórico");
  });

  it("does not modify shared order state-machine transitions", () => {
    const states = read("src/server/orders/state-machines.ts");
    expect(states).toContain('queued: ["preparing", "canceled"]');
    expect(states).toContain('preparing: ["ready", "canceled"]');
    expect(read("docs/FULFILLMENT_SEGMENT_AUDIT.md")).toContain("nenhuma transição interna foi alterada");
  });
});
