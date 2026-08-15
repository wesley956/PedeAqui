import fs from "node:fs";
import path from "node:path";
import { describe,expect,it } from "vitest";
const root=process.cwd();const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const service=read("src/server/platform/platform-order-diagnostic-service.ts");
const list=read("src/app/platform/operacao/page.tsx");
const page=read("src/app/platform/operacao/pedidos/[orderId]/page.tsx");
const layout=read("src/app/platform/layout.tsx");

describe("Operational order diagnostics [341]",()=>{
 it("gates global order reads with platform authorization",()=>{expect(service.indexOf("await PlatformAdminService.access()")).toBeGreaterThan(-1);expect(service.indexOf("createAdminClient()")).toBeGreaterThan(service.indexOf("await PlatformAdminService.access()"));});
 it("loads only support-safe order fields and no customer snapshots",()=>{for(const bad of ["customer_name_snapshot","customer_phone_snapshot","customer_email_snapshot","address_street_snapshot","address_number_snapshot","order_items"])expect(service).not.toContain(bad);expect(list).toContain("timeline operacional");});
 it("builds one timeline from order history, payments, delivery, printing and domain events",()=>{for(const table of ["order_state_history","payments","deliveries","delivery_history","print_jobs","domain_events"])expect(service).toContain(`from(\"${table}\")`);for(const domain of ["Pedido","Pagamento","Entrega","Impressão","Evento"])expect(service).toContain(`domain:\"${domain}\"`);expect(page).toContain("Timeline única");});
 it("detects known stuck and inconsistent patterns",()=>{for(const key of ["acceptance","payment_failed","pix_pending","production","delivery","printing","event","inconsistent_delivery"])expect(service).toContain(`key:\"${key}\"`);expect(page).toContain("Diagnóstico automático");});
 it("sanitizes errors before rendering them",()=>{expect(service).toContain("safeSupportText");expect(service).toContain("credencial protegida");expect(service).toContain("[dado protegido]");});
 it("does not expose direct state mutations",()=>{for(const table of ["orders","payments","deliveries"]){const mutation=new RegExp(`from\\(\\\"${table}\\\"\\)[\\s\\S]{0,500}?\\.update\\(`);expect(service).not.toMatch(mutation);}expect(page).toContain("Não existe botão para forçar");});
 it("routes platform operation navigation to the diagnostic queue",()=>{expect(layout).toContain('["Operação", "/platform/operacao"]');expect(list).toContain("/platform/operacao/pedidos/${order.id}");});
});
