import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const purchases=readFileSync("src/app/(app)/compras/page.tsx","utf8");
const suppliers=readFileSync("src/app/(app)/fornecedores/page.tsx","utf8");
const styles=readFileSync("src/features/purchases/procurement.module.css","utf8");
describe("procurement UI",()=>{
  it("shows the full operational sequence",()=>{for(const step of ["1. Necessidade","2. Pedido","3. Fornecedor","4. Recebimento","5. Estoque"])expect(purchases).toContain(step)});
  it("keeps receiving and correction on server-backed forms",()=>{expect(purchases).toContain("ReceivePurchaseForm");expect(purchases).toContain("CorrectReceiptForm");expect(purchases).not.toContain("supabase")});
  it("makes partial receipts and supplier activation explicit",()=>{expect(purchases).toContain("Recebimento parcial");expect(suppliers).toContain("Ativo na unidade");expect(suppliers).toContain("Não habilitado")});
  it("collapses the workflow for mobile",()=>{expect(styles).toContain("@media(max-width:640px)");expect(styles).toContain("grid-template-columns:1fr")});
});
