import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const overview = readFileSync(join(process.cwd(), "src/app/(app)/salao/page.tsx"), "utf8");
const settings = readFileSync(join(process.cwd(), "src/app/(app)/configuracoes/salao/page.tsx"), "utf8");
const hub = readFileSync(join(process.cwd(), "src/app/(app)/configuracoes/page.tsx"), "utf8");

describe("dining overview", () => {
  it("keeps the operational surface focused on table status and active tabs", () => {
    for (const text of ["livres", "em atendimento", "com conta solicitada", "due_cents", "occupiedMinutes"]) expect(overview).toContain(text);
    expect(overview).not.toContain("createDiningTableAction");
  });

  it("moves table creation to Settings behind dining.manage", () => {
    expect(settings).toContain("authorize(PERMISSIONS.DINING_MANAGE)");
    expect(settings).toContain("createDiningTableAction");
    expect(hub).toContain('href: "/configuracoes/salao"');
    expect(hub).toContain("PERMISSIONS.DINING_MANAGE");
  });

  it("communicates bill requested from the authoritative tab status", () => {
    expect(overview).toContain('tab?.status === "settling"');
    expect(overview).toContain("Conta solicitada");
  });

  it("does not expose table ids as primary copy", () => {
    expect(overview).not.toContain("ID da mesa");
    expect(overview).not.toContain("table.id}</");
  });
});
