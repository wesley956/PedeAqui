import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/sql/123_subscription_addons_contract_changes.sql");
const service = read("src/server/platform/platform-commercial-billing-service.ts");
const actions = read("src/features/platform-commercial-billing/actions.ts");
const page = read("src/app/platform/assinaturas/page.tsx");
const matrix = read("docs/qa/CRUD_SECURITY_MATRIX_146_168.md");

describe("PA-DIAG 146-153 — contrato modular sem retroatividade", () => {
  it("mantém módulos adicionais separados do plano-base", () => {
    expect(sql).toContain("create table public.subscription_addons");
    expect(sql).toContain("feature_name_snapshot");
    expect(sql).toContain("unit_price_cents");
    expect(page).toContain("sem substituir o plano-base");
  });

  it("persiste simulação, preço anterior, preço proposto e vigência", () => {
    expect(sql).toContain("create table public.subscription_change_requests");
    expect(sql).toContain("current_base_price_cents");
    expect(sql).toContain("current_addons_price_cents");
    expect(sql).toContain("proposed_total_price_cents");
    expect(sql).toContain("p_effective_at");
    expect(service).toContain("createChangeQuote");
    expect(actions).toContain("createSubscriptionChangeQuoteAction");
  });

  it("exige aceite e impede aplicação antes da data programada", () => {
    expect(sql).toContain("accepted_at timestamptz");
    expect(sql).toContain("accepted_by uuid");
    expect(sql).toContain("change is scheduled for a future date");
    expect(sql).toContain("only draft changes can be accepted");
    expect(page).toContain("Registrar aceite");
    expect(page).toContain("Aplicação liberada na data programada");
  });

  it("protege o preço vitalício e históricos financeiros", () => {
    expect(sql).toContain("protect_locked_subscription_price");
    expect(sql).toContain("locked subscription base price cannot be changed");
    expect(sql).toContain("on delete restrict");
    expect(sql).toContain("contract history cannot be deleted");
    expect(sql).not.toMatch(/on delete cascade/);
  });

  it("entrega histórico e relatório por plano e módulo", () => {
    expect(service).toContain("revenueByPlan");
    expect(service).toContain("revenueByModule");
    expect(service).toContain("subscription_change_requests");
    expect(page).toContain("Solicitações e mudanças comerciais");
    expect(page).toContain("Pedidos de módulos feitos pelo cliente só são ativados após sua aprovação");
    expect(page).toContain("Receita por plano e módulo");
  });
});

describe("PA-CRUD 001-015 — segurança transversal", () => {
  it("nega acesso direto do navegador e restringe RPCs ao servidor", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("from anon,authenticated");
    expect(sql.match(/browser_deny/g) ?? []).toHaveLength(2);
    expect(sql.match(/to service_role/g) ?? []).toHaveLength(4);
    expect(sql.match(/require_platform_super_admin/g) ?? []).toHaveLength(3);
  });

  it("indexa todas as chaves estrangeiras do novo domínio", () => {
    for (const token of [
      "subscription_addons_org_idx", "subscription_addons_subscription_idx", "subscription_addons_feature_idx",
      "subscription_addons_accepted_by_idx", "subscription_addons_created_by_idx", "subscription_change_requests_org_idx",
      "subscription_change_requests_subscription_idx", "subscription_change_requests_current_plan_idx",
      "subscription_change_requests_current_version_idx", "subscription_change_requests_target_plan_idx",
      "subscription_change_requests_target_version_idx", "subscription_change_requests_feature_idx",
      "subscription_change_requests_accepted_by_idx", "subscription_change_requests_created_by_idx",
    ]) expect(sql).toContain(token);
  });

  it("documenta CRUD, delete sem hard delete, restore, RBAC e isolamento", () => {
    for (let index = 1; index <= 15; index += 1) expect(matrix).toContain(`PA-CRUD-${String(index).padStart(3, "0")}`);
    for (const token of ["Create", "Read", "Update", "Delete/Restore", "tenant A ≠ tenant B", "hard delete", "anon", "service_role"])
      expect(matrix).toContain(token);
  });

  it("mantém mutações em Server Actions e revalida o painel", () => {
    expect(actions.startsWith('"use server"')).toBe(true);
    expect(actions).toContain("acceptSubscriptionChangeAction");
    expect(actions).toContain("applyScheduledSubscriptionChangeAction");
    expect(actions).toContain('revalidatePath("/platform/assinaturas")');
  });
});
