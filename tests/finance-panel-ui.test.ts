import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const page=readFileSync("src/app/(app)/financeiro/page.tsx","utf8");
const styles=readFileSync("src/app/(app)/financeiro/finance-panel.module.css","utf8");
describe("finance panel UI",()=>{
  it("keeps management layers explicit",()=>{for(const label of ["Contas","Contas a receber e a pagar","Novo lançamento","Transferir entre contas","Histórico de movimentos"])expect(page).toContain(label)});
  it("preserves authoritative finance forms",()=>{for(const form of ["ManualFinanceEntryForm","FinanceTransferForm","SettleObligationForm","ReverseSettlementForm"])expect(page).toContain(form);expect(page).not.toContain("supabase")});
  it("preserves immutable-ledger messaging",()=>{expect(page).toContain("ledger é imutável");expect(page).toContain("Estorno cria novo lançamento")});
  it("adapts reports and actions to smaller screens",()=>{expect(styles).toContain("@media(max-width:980px)");expect(styles).toContain("grid-template-columns:1fr")});
});
