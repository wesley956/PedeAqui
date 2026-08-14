import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/configuracoes/page.tsx"), "utf8");
const navigation = fs.readFileSync(path.join(process.cwd(), "src/components/layout/navigation-model.ts"), "utf8");

describe("operation versus settings", () => {
  it("uses resolved access before showing administrative shortcuts", () => {
    expect(page).toContain("NavigationAccessService.load()");
    expect(page).toContain("access.items.filter");
    expect(page).toContain("access.permissionKeys");
  });

  it("keeps store, conversation and printing settings behind existing permission signals", () => {
    expect(page).toContain("PERMISSIONS.STORES_VIEW");
    expect(page).toContain("PERMISSIONS.INTEGRATIONS_VIEW");
    expect(page).toContain("PERMISSIONS.PRINTING_VIEW");
  });

  it("preserves operation routes in the canonical navigation model", () => {
    for (const href of ["/pedidos", "/pdv", "/salao", "/producao", "/entregas", "/entregador"]) {
      expect(navigation).toContain(`href: "${href}"`);
    }
  });

  it("keeps the existing settings URLs instead of renaming them", () => {
    for (const href of ["/configuracoes/cardapio", "/configuracoes/horarios", "/configuracoes/entrega", "/configuracoes/pagamentos", "/configuracoes/conversas", "/configuracoes/impressoes"]) {
      expect(page).toContain(href);
    }
  });
});
