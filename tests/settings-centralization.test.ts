import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const page=readFileSync("src/app/(app)/configuracoes/page.tsx","utf8");
describe("central settings hub",()=>{
  it("groups settings by responsibility",()=>{for(const group of ["Estabelecimento","Operação","Canais e integrações","Equipe, cadastros e estrutura"])expect(page).toContain(group)});
  it("keeps existing configuration routes as the unique destinations",()=>{for(const href of ["/configuracoes/cardapio","/configuracoes/horarios","/configuracoes/entrega","/configuracoes/pagamentos","/configuracoes/conversas","/configuracoes/impressoes"])expect(page).toContain(href)});
  it("uses resolved permissions before rendering links",()=>{expect(page).toContain("NavigationAccessService.load()");expect(page).toContain("access.permissionKeys");expect(page).toContain("access.items.filter")});
});
