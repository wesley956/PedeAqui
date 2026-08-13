import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

function read(path:string){ return readFileSync(join(process.cwd(),path),"utf8").toLowerCase(); }
const core=read("supabase/sql/66_finance_core.sql");
const operations=read("supabase/sql/67_finance_operations.sql");
const integrations=read("supabase/sql/68_finance_integrations.sql");
const corrections=read("supabase/sql/69_finance_corrections_hardening.sql");
const reporting=read("supabase/sql/70_finance_reporting.sql");
const boundaries=read("supabase/sql/72_finance_domain_boundaries.sql");
const mutationService=read("src/server/finance/finance-service.ts");
const readService=read("src/server/finance/finance-read-service.ts");
const page=read("src/app/(app)/financeiro/page.tsx");
const permissions=read("src/server/access/permissions.ts");

describe("finance ledger contracts",()=>{
  it("uses immutable transactions and projected balances",()=>{
    expect(core).toContain("create table public.financial_transactions");
    expect(core).toContain("financial_transactions_immutable");
    expect(core).toContain("create table public.financial_account_balances");
    expect(page).toContain("sem editar saldo diretamente");
    expect(page).not.toContain('name="balancecents"');
  });

  it("separates accrual recognition from settlement and cash flow",()=>{
    expect(core).toContain("'recognition'");
    expect(core).toContain("'settlement'");
    expect(reporting).toContain("competence_date between p_from and p_to");
    expect(reporting).toContain("t.account_id is not null");
    expect(reporting).toContain("'settlement','settlement_reversal','transfer','manual_adjustment'");
  });

  it("keeps finance tables and RPCs server-only",()=>{
    expect(core).toContain("enable row level security");
    expect(core).toContain("from anon,authenticated");
    expect(reporting).toContain("revoke all on function public.financial_report_internal");
    expect(reporting).toMatch(/grant execute on function public\.financial_report_internal[^;]+to service_role/);
  });

  it("exposes granular finance permissions centrally",()=>{
    for(const key of ["finance.view","finance.manage","finance.settle","finance.reports"]) expect(permissions).toContain(key);
  });
});

describe("finance source-of-truth boundaries",()=>{
  it("recognizes completed orders and settles them through payments",()=>{
    expect(integrations).toContain("finance_sync_completed_order");
    expect(integrations).toContain("finance_sync_payment");
    expect(integrations).toContain("financial order recognition does not match order total");
    expect(boundaries).toContain("order receivable must be settled through payments");
    expect(mutationService).toContain("venda deve ser liquidada pelo módulo pagamentos");
  });

  it("does not let Finance manually reverse payment-owned settlements",()=>{
    expect(boundaries).toContain("automated settlement must be reversed by its source domain");
    expect(mutationService).toContain("liquidação automática deve ser estornada no domínio de origem");
  });

  it("mirrors physical cash without duplicating cash sale/refund",()=>{
    expect(integrations).toContain("v_move.movement_type in ('sale','refund') then return");
    expect(integrations).toContain("cash_on_hand");
  });

  it("creates COGS from real inventory consumption cost",()=>{
    expect(integrations).toContain("v_move.unit_cost_micros");
    expect(integrations).toContain("finance-cogs:");
    expect(integrations).toContain("private.finance_category_id(v_move.organization_id,'cogs')");
  });
});

describe("finance corrections",()=>{
  it("refunds reverse settlement and reduce accrual",()=>{
    expect(corrections).toContain("sales_refunds");
    expect(corrections).toContain("'settlement_reversal'");
    expect(corrections).toContain("'obligation_adjustment','in',-1");
    expect(corrections).toContain("finance-payment-refund-recognition:");
  });

  it("turns already-paid purchase corrections into supplier credit",()=>{
    expect(corrections).toContain("v_reduce:=least(v_item.line_total_cents,v_ob.open_cents)");
    expect(corrections).toContain("v_credit:=v_item.line_total_cents-v_reduce");
    expect(corrections).toContain("'supplier_credit'");
    expect(corrections).toContain("crédito contra fornecedor");
  });

  it("snapshots supplier payment term in purchase order",()=>{
    expect(integrations).toContain("payment_term_days_snapshot");
    expect(integrations).toContain("purchase_orders_snapshot_payment_term");
  });
});

describe("finance idempotency and access",()=>{
  it("makes manual entries and transfers deterministic on retry",()=>{
    expect(operations).toContain("v_hash:=md5(v_source.organization_id::text||':transfer:'||trim(p_idempotency_key))");
    expect(operations).toContain("v_hash:=md5(v_store.organization_id::text||':manual:'||trim(p_idempotency_key))");
    expect(operations).toContain("financial idempotency key reused with different payload");
  });

  it("authorizes mutations before admin access",()=>{
    expect(mutationService).toContain("authorize(permission(\"finance.manage\"))");
    expect(mutationService).toContain("authorize(permission(\"finance.settle\"))");
    expect(mutationService.indexOf("authorize(permission(\"finance.manage\"))")).toBeLessThan(mutationService.indexOf("createadminclient()"));
  });

  it("only loads DRE/report after finance.reports permission",()=>{
    expect(readService).toContain("can(\"finance.reports\",context)");
    expect(readService).toContain("if(canreports)");
    expect(readService.indexOf("if(canreports)")).toBeLessThan(readService.indexOf("financial_report_internal"));
    expect(page).toContain("data.canreports&&report");
  });
});
