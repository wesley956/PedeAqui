import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextLocalMidnight } from "@/server/catalog/pause-schedule";
import { modulesForPreset } from "@/modules/module-catalog";

const read = (path: string) => readFileSync(path, "utf8");

describe("volta sozinho amanhã", () => {
  it("returns 00:00 of the next day in the store's time zone", () => {
    expect(nextLocalMidnight("America/Sao_Paulo", new Date("2026-10-17T23:30:00-03:00")).toISOString()).toBe("2026-10-18T03:00:00.000Z");
    expect(nextLocalMidnight("America/Sao_Paulo", new Date("2026-10-18T00:10:00-03:00")).toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(nextLocalMidnight("America/Manaus", new Date("2026-10-17T12:00:00-04:00")).toISOString()).toBe("2026-10-18T04:00:00.000Z");
  });

  it("reactivates only items still paused, clears the schedule on manual reactivation and runs on a schedule", () => {
    const sql = read("supabase/sql/231_catalog_paused_until.sql");
    expect(sql).toContain("add column if not exists paused_until timestamptz");
    expect(sql).toContain("availability = 'sold_out' and deleted_at is null");
    expect(sql).toContain("if new.availability = 'available' then new.paused_until := null; end if;");
    expect(sql).toContain("cron.schedule('pedeaqui-catalog-reactivation'");
    expect(sql).toContain("revoke all on function private.reactivate_scheduled_catalog_items() from public, anon, authenticated");
  });

  it("offers the option on the availability screen", () => {
    expect(read("src/app/(app)/cardapio/disponibilidade/availability-board.tsx")).toContain("Voltar sozinho amanhã às 00:00");
  });
});

describe("páginas longas em abas", () => {
  it("splits finance, growth, payments and orders into URL tabs", () => {
    expect(read("src/app/(app)/financeiro/page.tsx")).toContain('label="Seções do financeiro"');
    expect(read("src/app/(app)/crescimento/page.tsx")).toContain('label="Áreas de crescimento"');
    expect(read("src/app/(app)/configuracoes/pagamentos/page.tsx")).toContain('label="Seções de pagamento"');
    for (const page of ["pedidos/page.tsx", "pedidos/historico/page.tsx", "movimento/page.tsx"]) expect(read(`src/app/(app)/${page}`)).toContain("<OrdersTabs");
  });

  it("brings the step-by-step order flow into the guided operation settings", () => {
    expect(read("src/app/(app)/configuracoes/operacao/page.tsx")).toContain("<OrderWorkflowSettingsForm");
  });
});

describe("módulos padrão de lojas novas", () => {
  it("leaves back-office modules off in the complete preset", () => {
    for (const businessType of ["restaurant", "gas", "generic_commerce"] as const) {
      const modules = modulesForPreset(businessType, "complete");
      for (const key of ["inventory", "suppliers", "purchases", "fiscal"]) expect(modules).not.toContain(key);
      expect(modules).toContain("catalog");
    }
  });
});
