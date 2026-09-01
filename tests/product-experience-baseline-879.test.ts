import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeProductMetadata } from "@/server/product-experience/contracts";

const read=(path:string)=>readFileSync(path,"utf8");

describe("product experience baseline [879]",()=>{
 it("keeps telemetry non-authoritative and browser-denied",()=>{
  const sql=read("supabase/sql/171_product_experience_events.sql");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("revoke all on table public.product_experience_events from public, anon, authenticated");
  expect(sql).toContain("product_experience_events_store_scope_fk");
  expect(sql).toContain("product_experience_events_order_scope_fk");
  expect(sql).toContain("interval '180 days'");
 });

 it("drops sensitive or unknown metadata instead of persisting it",()=>{
  expect(safeProductMetadata("px.order.action",{
   action:"accept",surface:"order_manager",address:"Rua privada",phone:"19999999999",token:"secret",
  })).toEqual({action:"accept",surface:"order_manager"});
 });

 it("swallows sink failures and never throws them into restaurant work",()=>{
  const service=read("src/server/product-experience/product-experience-service.ts");
  expect(service).toContain("product_experience_capture_failed");
  expect(service).toContain("return false");
  expect(service).toContain("catch (error)");
  const actions=read("src/features/orders/actions.ts");
  expect(actions).toContain("after(async () =>");
  expect(actions).toContain("telemetry is never authoritative");
 });

 it("documents honest before/after limits and pilot observation",()=>{
  const doc=read("docs/PRODUCT_EXPERIENCE_BASELINE_879.md");
  for(const phrase of ["Não medido","Dona Maria","Dom Burger","14 dias","sem interferência","180 dias"])expect(doc).toContain(phrase);
  const page=read("src/app/platform/operacao/praticidade/page.tsx");
  expect(page).toContain("Praticidade dos clientes-piloto");
  expect(page).toContain("Limites honestos do baseline");
 });

 it("uses stable versioned event names",()=>{
  const contracts=read("src/server/product-experience/contracts.ts");
  for(const event of ["px.order.action","px.realtime.connection","px.operation.pause","px.onboarding.step","px.checkout.step","px.print.recovery"])expect(contracts).toContain(event);
  expect(contracts).toContain("PRODUCT_EXPERIENCE_SCHEMA_VERSION = 1");
 });
});
