import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";
import type { FiscalProvider } from "@/server/fiscal/fiscal-provider";

function read(path:string){ return readFileSync(join(process.cwd(),path),"utf8").toLowerCase(); }
const core=read("supabase/sql/74_fiscal_core.sql");
const operations=read("supabase/sql/75_fiscal_operations.sql");
const configuration=read("supabase/sql/76_fiscal_configuration.sql");
const webhooks=read("supabase/sql/77_fiscal_webhooks_storage.sql");
const indexes=read("supabase/sql/78_fiscal_fk_indexes.sql");
const service=read("src/server/fiscal/fiscal-service.ts");
const worker=read("src/server/fiscal/fiscal-worker.ts");
const webhookService=read("src/server/fiscal/fiscal-webhook-service.ts");
const webhookRoute=read("src/app/api/webhooks/fiscal/[integrationid]/route.ts");
const artifactService=read("src/server/fiscal/fiscal-artifact-service.ts");
const registry=read("src/server/fiscal/fiscal-provider-registry.ts");
const page=read("src/app/(app)/fiscal/page.tsx");
const permissions=read("src/server/access/permissions.ts");

describe("fiscal domain contracts",()=>{
  it("keeps fiscal status independent from order state",()=>{
    expect(core).toContain("create table public.fiscal_documents");
    expect(core).toContain("draft','queued','processing','authorized','rejected','cancelled','contingency");
    expect(operations).toContain("private.fiscal_can_transition");
    expect(operations).toContain("when p_from='authorized' then p_to='cancelled'");
    expect(operations).not.toContain("update public.orders set order_status");
  });

  it("stores tax identifiers as text and snapshots fiscal item versions",()=>{
    expect(core).toContain("issuer_tax_id text not null");
    expect(core).toContain("ncm text");
    expect(operations).toContain("issuer_snapshot");
    expect(operations).toContain("fiscal_snapshot");
    expect(operations).toContain("missing_profile");
    expect(operations).toContain("all fiscal items require a fiscal profile before queue");
  });

  it("freezes fiscal items after the document leaves draft",()=>{
    expect(core).toContain("fiscal_items_lock_after_queue");
    expect(core).toContain("fiscal items are immutable after document is queued");
  });

  it("uses persistent lease/retry queue with skip locked",()=>{
    expect(operations).toContain("create table public.fiscal_jobs");
    expect(operations).toContain("for update skip locked");
    expect(operations).toContain("lease_expires_at");
    expect(operations).toContain("attempts < j.max_attempts");
    expect(worker).toContain("fiscal_claim_jobs_internal");
    expect(worker).toContain("fiscal_finish_job_internal");
  });
});

describe("fiscal security boundaries",()=>{
  it("stores only secret references in the domain",()=>{
    expect(core).toContain("secret_ref text");
    expect(core).toContain("webhook_secret_ref text");
    expect(core).toContain("certificate_ref text");
    expect(service).not.toContain("process.env[");
    expect(worker).toContain("resolvesecretreference");
  });

  it("authorizes before creating admin client",()=>{
    for(const key of ["fiscal.issue","fiscal.cancel","fiscal.manage","integrations.manage"]){ expect(service).toContain(`authorize(permission(\"${key}\"))`); }
    expect(service.indexOf("authorize(permission(\"fiscal.issue\"))")).toBeLessThan(service.indexOf("createadminclient()"));
  });

  it("keeps core tables and RPCs server-only",()=>{
    expect(core).toContain("from anon,authenticated");
    expect(operations).toContain("to service_role");
    expect(webhooks).toContain("fiscal_webhook_receipts_browser_deny");
    expect(configuration).toContain("fiscal_configure_profile_internal");
    expect(configuration).toMatch(/revoke all on function public\.fiscal_configure_profile_internal[^;]+from public,anon,authenticated/);
  });

  it("requires provider verification for webhooks and caps payload",()=>{
    expect(webhookService).toContain("provider.verifywebhook");
    expect(webhookService).toContain("invalid fiscal webhook signature");
    expect(webhookRoute).toContain("1_000_000");
    expect(webhooks).toContain("webhook replay payload mismatch");
  });

  it("uses explicit adapter registry rather than dynamic code loading",()=>{
    expect(registry).toContain("new map<string,fiscalprovider>()");
    expect(registry).not.toContain("import(");
    expect(registry).not.toContain("eval(");
  });
});

describe("fiscal artifacts and UI",()=>{
  it("keeps artifacts in private storage with tenant-scoped paths",()=>{
    expect(webhooks).toContain("'fiscal-artifacts','fiscal-artifacts',false");
    expect(webhooks).toContain("invalid fiscal xml path scope");
    expect(artifactService).toContain("createsignedurl");
    expect(artifactService).toContain("authorize(permission(\"fiscal.view\"))");
    expect(artifactService).toContain("${input.organizationid}/${input.storeid}/${input.fiscaldocumentid}");
  });

  it("exposes fiscal UI and granular permissions",()=>{
    for(const key of ["fiscal.view","fiscal.manage","fiscal.issue","fiscal.cancel","integrations.view","integrations.manage"]) expect(permissions).toContain(key);
    expect(page).toContain("fiscal e integrações");
    expect(page).toContain("documentos fiscais");
  });

  it("covers foreign keys introduced by fiscal domain",()=>{
    for(const name of ["fiscal_documents_integration_fk_idx","fiscal_items_order_item_fk_idx","fiscal_items_product_fk_idx","fiscal_jobs_integration_fk_idx","fiscal_webhook_receipts_integration_fk_idx"]) expect(indexes).toContain(name);
  });
});

describe("provider adapter contract",()=>{
  it("allows a fake adapter without coupling core domain to a vendor",async()=>{
    const fake:FiscalProvider={
      key:"fake.fiscal",
      async issue(){ return { status:"authorized" as const,providerDocumentId:"fake-1",accessKey:"351234",protocol:"135",artifacts:{ xml:"<nfe/>" } }; },
      async cancel(){ return { status:"cancelled" as const,cancellationProtocol:"cancel-1" }; },
      verifyWebhook(){ return true; },
      parseWebhook(){ return [{ externalEventId:"evt-1",providerDocumentId:"fake-1",status:"authorized" as const,accessKey:"351234",protocol:"135" }]; },
    };
    const issued=await fake.issue({ document:{ id:"doc-1" },items:[] },{ providerKey:fake.key,environment:"homologation",secret:"test",config:{} });
    expect(issued.status).toBe("authorized");
    const cancelled=await fake.cancel({ document:{ id:"doc-1" },items:[],reason:"teste" },{ providerKey:fake.key,environment:"homologation",secret:"test",config:{} });
    expect(cancelled.cancellationProtocol).toBe("cancel-1");
  });
});
