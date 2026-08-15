import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const service=read("src/server/platform/platform-integration-health-service.ts");
const page=read("src/app/platform/integracoes/page.tsx");
const layout=read("src/app/platform/layout.tsx");

describe("Platform integration health center [340]",()=>{
  it("gates privileged health reads before the admin client",()=>{expect(service.indexOf("await PlatformAdminService.access()")).toBeGreaterThan(-1);expect(service.indexOf("createAdminClient()")).toBeGreaterThan(service.indexOf("await PlatformAdminService.access()"));});
  it("covers the required operational integrations",()=>{for(const value of ["whatsapp","printing","webhook","billing","payments"])expect(service).toContain(`\"${value}\"`);for(const table of ["store_conversation_settings","messages","print_agents","printers","print_jobs","integration_webhook_deliveries","billing_webhook_receipts","integrations"])expect(service).toContain(`from(\"${table}\")`);});
  it("uses commercial health states and explains operational impact",()=>{for(const value of ["connected","attention","action_required","unavailable","disconnected"])expect(service).toContain(`\"${value}\"`);expect(page).toContain("Impacto");expect(page).toContain("Ação necessária");expect(page).toContain("não altera estado financeiro ou operacional");});
  it("never loads message bodies, webhook payloads or print payloads",()=>{expect(service).not.toContain("body,external_message_id");expect(service).not.toContain("payload_hash,payload");expect(service).not.toContain("rendered_content");expect(page).not.toContain("access_token_secret_ref");expect(page).not.toContain("app_secret_secret_ref");expect(page).not.toContain("secret_ref");});
  it("sanitizes provider errors before rendering support detail",()=>{expect(service).toContain("safeFailure");expect(service).toContain("credencial protegida");expect(service).toContain("[dado protegido]");});
  it("links navigation and affected units to the health center and 360 view",()=>{expect(layout).toContain('["Integrações", "/platform/integracoes"]');expect(page).toContain("/platform/unidades/${item.storeId}");});
});
