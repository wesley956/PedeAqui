import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8").replace(/\s+/g, " ");

describe("subscription contract acceptance", () => {
  it("creates an append-only evidence ledger with RLS and a disabled legal identity seed", () => {
    const sql = read("supabase/sql/170_subscription_contract_acceptance.sql");
    expect(sql).toContain("create table if not exists public.subscription_contract_acceptances");
    expect(sql).toContain("unique (subscription_id, contract_version)");
    expect(sql).toContain("alter table public.subscription_contract_acceptances enable row level security");
    expect(sql).toContain("revoke all on table public.subscription_contract_acceptances from anon, authenticated");
    expect(sql).toContain("subscription_contract_acceptances_append_only");
    expect(sql).toContain("legal.contractor.identity");
    expect(sql).toContain("false");
  });

  it("versions and hashes the full contract plus commercial snapshot", () => {
    const service = read("src/server/billing/subscription-contract-service.ts");
    expect(service).toContain('CURRENT_SUBSCRIPTION_CONTRACT_VERSION = "2026.09-v1"');
    expect(service).toContain('createHash("sha256")');
    expect(service).toContain("contract: document, commercial");
    expect(service).toContain("Plano Fundadores");
    expect(service).toContain("Aceite eletrônico e prova da contratação");
  });

  it("allows only an owner and blocks acceptance until contractor identity is complete", () => {
    const service = read("src/server/billing/subscription-contract-acceptance-service.ts");
    expect(service).toContain('moduleSnapshot.roleKeys.includes("owner")');
    expect(service).toContain("if (!contractor.complete) throw new SubscriptionContractConfigurationError()");
    expect(service).toContain('from("subscription_contract_acceptances")');
    expect(service).toContain("document_sha256: hash");
    expect(service).toContain("commercial_snapshot: commercial");
  });

  it("captures current commercial terms without mutating the subscription", () => {
    const service = read("src/server/billing/subscription-contract-acceptance-service.ts");
    expect(service).toContain("price_locked: subscription.price_locked === true");
    expect(service).toContain("founder_slot: subscription.founder_slot");
    expect(service).toContain("modules: [...moduleSnapshot.enabledModuleKeys].sort()");
    expect(service).not.toContain('.from("organization_subscriptions").update(');
  });

  it("shows pending, accepted and printable proof surfaces in Minha assinatura", () => {
    const page = read("src/app/(app)/assinatura/page.tsx");
    const contract = read("src/app/(app)/assinatura/contrato/page.tsx");
    const receipt = read("src/app/(app)/assinatura/contrato/comprovante/page.tsx");
    expect(page).toContain("Contrato pendente de formalização");
    expect(page).toContain("Contrato vigente");
    expect(page).toContain("<ContractAcceptanceForm");
    expect(contract).toContain("DOCUMENTO ACEITO E PRESERVADO");
    expect(receipt).toContain("COMPROVANTE ELETRÔNICO DE ACEITE");
    expect(receipt).toContain("SHA-256");
  });
});
