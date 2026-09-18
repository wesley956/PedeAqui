import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  asksForMenuDescription,
  catalogAvailabilityQueryFromInput,
  explicitCatalogItemRequest,
} from "@/server/conversations/whatsapp-catalog-intent-core";
import { canonicalPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("INT-EVOL-03 catalog and payment regressions", () => {
  it("distinguishes a menu description from a plain menu link", () => {
    expect(asksForMenuDescription("você consegue descrever o cardápio pra mim?")).toBe(true);
    expect(asksForMenuDescription("me dá um resumo do menu")).toBe(true);
    expect(asksForMenuDescription("qual é o cardápio?")).toBe(false);
  });

  it("understands natural availability questions in both Portuguese word orders", () => {
    expect(catalogAvailabilityQueryFromInput("tem caixa?")).toBe("caixa");
    expect(catalogAvailabilityQueryFromInput("e caixa tem?")).toBe("caixa");
    expect(catalogAvailabilityQueryFromInput("quero saber se tem caixas de salgado")).toBe("caixas de salgado");
    expect(catalogAvailabilityQueryFromInput("tem cardápio?")).toBeNull();
  });

  it("keeps quantity plus flavor text available for composition-aware lookup", () => {
    expect(explicitCatalogItemRequest("2 coxinha de frango")).toEqual({ quantity: 2, query: "coxinha de frango" });
    expect(explicitCatalogItemRequest("2 caixa com 30 salgados")).toEqual({ quantity: 2, query: "caixa com 30 salgados" });
  });

  it("explains unavailable Pix explicitly from canonical enabled options", () => {
    const body = canonicalPaymentGuidanceMessage([
      { method: "pix", enabled: false, sortOrder: 10 },
      { method: "cash", enabled: true, sortOrder: 20 },
      { method: "credit_card", enabled: true, sortOrder: 30 },
    ], "quero pagar no piks");
    expect(body).toContain("Pix não está disponível");
    expect(body).toContain("Dinheiro");
    expect(body).toContain("Cartão de crédito");
  });

  it("uses canonical catalog projection and scoped composition tables instead of inventing products", () => {
    const catalog = read("src/server/conversations/whatsapp-catalog-conversation-service.ts");
    expect(catalog).toContain("IntelligenceCatalogAdapter");
    expect(catalog).toContain('admin.from("modifiers")');
    expect(catalog).toContain('admin.from("product_modifier_groups")');
    expect(catalog).toContain('admin.from("products")');
    expect(catalog).toContain('.eq("organization_id", input.organizationId)');
    expect(catalog).toContain('.eq("store_id", input.storeId)');
  });

  it("checks modifiers before the fuzzy canonical order parser, but leaves an active composition alone", () => {
    const side = read("src/server/conversations/whatsapp-active-order-side-intent.ts");
    const smart = read("src/server/conversations/whatsapp-smart-order-service.ts");
    expect(side).toContain("!hasPendingComposition(input.context)");
    expect(side).toContain("buildWhatsAppModifierPlacement(catalogInput, explicitItem.query)");
    expect(smart.indexOf("answerActiveOrderSideIntent(input)")).toBeLessThan(smart.indexOf("EnhancedWhatsAppOrderService.handle"));
  });

  it("does not reuse stale product choices after an explicit topic change", () => {
    const smart = read("src/server/conversations/whatsapp-smart-order-service.ts");
    expect(smart).toContain("clearStaleChoicesForExplicitProduct");
    expect(smart).toContain("pendingChoices: undefined");
    expect(smart).toContain("pendingChoices(input.context).length === 0");
  });
});
