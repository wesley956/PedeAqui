import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root=process.cwd();
const read=(relative:string)=>fs.readFileSync(path.join(root,relative),"utf8").replace(/\s+/g," ");

describe("platform owner backoffice v4",()=>{
  it("exposes the completed owner navigation while keeping owner-only sections conditional",()=>{
    const layout=read("src/app/platform/layout.tsx");
    for(const route of ["/platform/pendencias","/platform/comercial","/platform/financeiro","/platform/fundadores","/platform/onboarding","/platform/comunicacao","/platform/auditoria","/platform/equipe","/platform/privacidade","/platform/configuracoes"]) expect(layout).toContain(route);
    expect(layout).toContain('const ownerOnly = role === "super_admin"');
    expect(layout).toContain('...(ownerOnly ?');
  });

  it("keeps sensitive commercial and governance routes behind super-admin layouts",()=>{
    for(const file of [
      "src/app/platform/comercial/layout.tsx","src/app/platform/financeiro/layout.tsx","src/app/platform/fundadores/layout.tsx","src/app/platform/equipe/layout.tsx",
      "src/app/platform/onboarding/layout.tsx","src/app/platform/comunicacao/layout.tsx","src/app/platform/configuracoes/layout.tsx","src/app/platform/privacidade/layout.tsx",
    ]){
      const source=read(file);
      expect(source).toContain('access.role !== "super_admin"');
      expect(source).toContain("notFound()");
    }
  });

  it("creates a company 360 without merging contract plan and functional equivalence",()=>{
    const page=read("src/app/platform/empresas/[organizationId]/page.tsx");
    expect(page).toContain("Plano comercial");
    expect(page).toContain("Equivalência funcional");
    expect(page).toContain("Clube Fundadores");
    expect(page).toContain("Equipe do cliente");
  });

  it("consolidates pending actions and SaaS financial metrics",()=>{
    const service=read("src/server/platform/platform-backoffice-service.ts");
    expect(service).toContain("loadPendencies");
    expect(service).toContain("loadFinance");
    expect(service).toContain("mrrCents");
    expect(service).toContain("overdueCents");
    expect(service).toContain("platform_incidents");
  });
});

describe("founders club safety",()=>{
  it("separates club membership, immutable rewards, benefits and redemptions",()=>{
    const migration=read("supabase/sql/161_founders_club_v1.sql");
    expect(migration).toContain("founder_club_memberships");
    expect(migration).toContain("founder_club_reward_ledger");
    expect(migration).toContain("founder_club_benefits");
    expect(migration).toContain("founder_club_redemptions");
    expect(migration).toContain("founder club history is immutable");
    expect(migration).toContain("founder_club_member_balances");
  });

  it("requires a protected founder slot for active club admission",()=>{
    const hardening=read("supabase/sql/163_platform_owner_security_founders.sql");
    expect(hardening).toContain("p.key='founders'");
    expect(hardening).toContain("s.price_locked=true");
    expect(hardening).toContain("s.founder_slot is not null");
    expect(hardening).toContain("active founder club membership requires a protected founders slot");
  });

  it("gives founders commercial entitlement to modules without auto-enabling store modules",()=>{
    const hardening=read("supabase/sql/163_platform_owner_security_founders.sql");
    expect(hardening).toContain("founder_entitlement");
    expect(hardening).toContain("sub.plan_key='founders'");
    expect(hardening).toContain("f.key like 'module.%'");
    expect(hardening).not.toContain("insert into public.store_modules");
  });

  it("keeps automatic rewards and cashout disabled until explicit approval",()=>{
    const migration=read("supabase/sql/164_platform_backoffice_operations_v1.sql");
    expect(migration).toContain("founders.rewards.auto_accrual");
    expect(migration).toContain("founders.cashout.enabled");
    expect(migration).toContain("to_jsonb(false)");
  });
});

describe("owner security and governance",()=>{
  it("never allows removing the last active super-admin",()=>{
    const migration=read("supabase/sql/163_platform_owner_security_founders.sql");
    expect(migration).toContain("cannot remove the last active super admin");
    expect(migration).toContain("platform_admin_save_internal");
  });

  it("supports forced logout by revoking auth sessions without deleting users",()=>{
    const migration=read("supabase/sql/163_platform_owner_security_founders.sql");
    expect(migration).toContain("delete from auth.sessions where user_id=p_target_user_id");
    expect(migration).not.toContain("delete from auth.users");
    const team=read("src/app/platform/equipe/page.tsx");
    expect(team).toContain("Revogar sessões desta conta");
  });

  it("adds CRM, onboarding, communication and privacy as audited backoffice domains",()=>{
    const crm=read("supabase/sql/162_platform_crm_v1.sql");
    const governance=read("supabase/sql/164_platform_backoffice_operations_v1.sql");
    expect(crm).toContain("platform_crm_leads");
    expect(crm).toContain("platform_crm_activities");
    expect(crm).toContain("CRM activity history is immutable");
    expect(governance).toContain("platform_onboarding_tasks");
    expect(governance).toContain("platform_customer_messages");
    expect(governance).toContain("platform_privacy_requests");
    expect(governance).toContain("platform_data_retention_policies");
  });

  it("keeps secrets outside global settings",()=>{
    const migration=read("supabase/sql/164_platform_backoffice_operations_v1.sql");
    const page=read("src/app/platform/configuracoes/page.tsx");
    expect(page).toContain("Tokens, credenciais e chaves de integração continuam exclusivamente em variáveis de ambiente/Vault");
    expect(migration).not.toContain("ACCESS_TOKEN=");
    expect(migration).not.toContain("SERVICE_ROLE_KEY=");
  });
});
