import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/escala/page.tsx", "utf8");
const css = readFileSync("src/app/(app)/escala/scale-v3.module.css", "utf8").replace(/\s+/g, "");
const inventory = readFileSync("docs/qa/ADMIN_UX_RESIDUAL_842.md", "utf8");

describe("administrative residual UX #842", () => {
  it("registers the audited administrative route inventory", () => {
    for (const route of ["/estoque", "/estoque/fichas", "/compras", "/fornecedores", "/financeiro", "/fiscal", "/equipe", "/escala"]) expect(inventory).toContain(`\`${route}\``);
  });

  it("turns the central purchasing table into labelled mobile cards", () => {
    for (const label of ["Insumo", "Unidade", "Atual", "Mínimo", "Falta", "Fornecedor"]) expect(page).toContain(`data-label="${label}"`);
    expect(css).toContain(".tablethead{display:none}");
    expect(css).toContain("content:attr(data-label)");
  });

  it("only exposes plan-segmented configuration when entitled", () => {
    expect(page).toContain('data.entitlements["branding.white_label"].enabled');
    expect(page).toContain('data.entitlements["domains.custom"].enabled');
    expect(page).toContain('data.entitlements["integrations.marketplace"].enabled');
  });
});
