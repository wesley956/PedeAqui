import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/(app)/configuracoes/page.tsx", "utf8");
describe("central settings hub", () => {
  it("groups settings by owner responsibilities", () => {
    for (const group of ["Minha loja", "Pedidos e atendimento", "Pagamentos", "Entrega e retirada", "WhatsApp", "Impressão automática", "Equipe e acessos"]) expect(page).toContain(group);
  });
  it("keeps existing configuration routes as the unique destinations", () => {
    for (const href of ["/configuracoes/cardapio", "/configuracoes/horarios", "/configuracoes/entrega", "/configuracoes/pagamentos", "/configuracoes/conversas", "/configuracoes/impressoes", "/configuracoes/impressoes/formato"]) expect(page).toContain(href);
  });
  it("uses resolved permissions before rendering links", () => {
    expect(page).toContain("NavigationAccessService.load()");
    expect(page).toContain("new Set(access.permissionKeys)");
    expect(page).toContain('.filter((item) => item.key === "team" || item.key === "scale")');
  });
});
