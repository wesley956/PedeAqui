import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const service = read("src/server/platform/platform-incident-service.ts");
const page = read("src/app/platform/incidentes/page.tsx");
const migration = read("supabase/sql/96_platform_incidents.sql");
const layout = read("src/app/platform/layout.tsx");

describe("Platform incidents and audit [344]", () => {
  it("keeps the incident lifecycle platform-only", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.platform_incidents from anon, authenticated");
    expect(migration).toContain("service_role");
    expect(service).toContain("await PlatformAdminService.access()");
  });
  it("groups operational failures without loading raw payloads", () => {
    expect(service).toContain('from("domain_events")');
    expect(service).toContain('from("print_jobs")');
    expect(service).toContain('from("fiscal_jobs")');
    expect(service).toContain('from("integration_webhook_deliveries")');
    expect(service).toContain('from("billing_webhook_receipts")');
    expect(service).not.toContain('select("payload');
    expect(page).toContain("Nenhum payload bruto");
  });
  it("sanitizes audit before and after data", () => {
    expect(service).toContain("secretKey");
    expect(service).toContain("safeObject");
    expect(service).toContain('from("audit_logs")');
    expect(page).toContain("antes/depois sanitizado");
  });
  it("supports incident lifecycle and internal notes", () => {
    expect(service).toContain('z.enum(["open", "investigating", "resolved"])');
    expect(service).toContain('from("platform_incidents").upsert');
    expect(page).toContain("Atualizar investigação");
    expect(page).toContain("Nota interna");
  });
  it("links the dedicated incident center", () => {
    expect(layout).toContain('["Incidentes", "/platform/incidentes"]');
  });
});
