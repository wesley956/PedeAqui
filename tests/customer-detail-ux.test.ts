import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/clientes/[id]/page.tsx", "utf8");
const styles = readFileSync("src/app/(app)/clientes/customers.module.css", "utf8");

describe("customer detail residual UX", () => {
  it("keeps identity, addresses and authorized order history together", () => {
    for (const content of ["Dados do cliente", "Endereços", "Histórico de pedidos", "historyRestricted"]) expect(page).toContain(content);
  });

  it("reveals the long address form only when requested", () => {
    expect(page).toContain("<details className={`card ${styles.addressComposer}`}>");
    expect(page).toContain("Adicionar endereço");
    expect(page).toContain("Salvar novo endereço");
    expect(styles).toContain(".addressComposer > summary:focus-visible");
  });

  it("preserves the existing customer mutation contracts", () => {
    for (const action of ["createCustomerAddressAction", "setDefaultCustomerAddressAction", "removeCustomerAddressAction"]) expect(page).toContain(action);
  });
});
