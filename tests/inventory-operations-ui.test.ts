import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inventory = readFileSync("src/app/(app)/estoque/page.tsx", "utf8");
const recipes = readFileSync("src/app/(app)/estoque/fichas/page.tsx", "utf8");
const styles = readFileSync("src/app/(app)/estoque/inventory-operations.module.css", "utf8");

describe("inventory operations UI", () => {
  it("keeps stock movement-based while presenting it in owner language", () => {
    expect(inventory).toContain("Movimentos recentes");
    expect(inventory).toContain("Histórico da operação");
    expect(inventory).toContain("InventoryMovementForm");
    expect(inventory).toContain("InventoryReconcileForm");
    expect(inventory).toContain("InventoryTransferForm");
  });

  it("makes stock criticality explicit without relying only on color", () => {
    expect(inventory).toContain('label="Saldo negativo"');
    expect(inventory).toContain('label="Estoque baixo"');
    expect(inventory).toContain('label="Estoque normal"');
  });

  it("keeps recipe history immutable and distinguishes the active version", () => {
    expect(recipes).toContain("Versões anteriores não são editadas");
    expect(recipes).toContain('label="Versão ativa"');
    expect(recipes).toContain('label="Histórico"');
    expect(recipes).toContain("estimatedCostCents");
  });

  it("provides mobile-first single-column operational actions", () => {
    expect(styles).toContain("@media(max-width:640px)");
    expect(styles).toContain("grid-template-columns:1fr");
  });
});
