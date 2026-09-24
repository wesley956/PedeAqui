import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeOrderTrackingCodeFromInput,
  isActiveOrderTrackingQuestion,
} from "@/server/conversations/whatsapp-active-order-side-intent-core";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("WhatsApp active order side intents", () => {
  it("recognizes tracking questions without treating generic order text as tracking", () => {
    for (const text of [
      "meu pedido",
      "acompanhar pedido",
      "onde está meu pedido?",
      "como esta meu pedido",
      "meu pedido já saiu?",
      "quero acompanhar meu pedido",
    ]) {
      expect(isActiveOrderTrackingQuestion(text)).toBe(true);
    }

    for (const text of [
      "quero fazer um pedido",
      "pedido de 20 coxinhas",
      "adiciona mais 2",
      "pedido",
    ]) {
      expect(isActiveOrderTrackingQuestion(text)).toBe(false);
    }
  });

  it("requires explicit tracking context before interpreting a number as an old order code", () => {
    expect(activeOrderTrackingCodeFromInput("20")).toBeNull();
    expect(activeOrderTrackingCodeFromInput("quero 20")).toBeNull();
    expect(activeOrderTrackingCodeFromInput("pedido 70")).toBe(70);
    expect(activeOrderTrackingCodeFromInput("código 42")).toBe(42);
  });

  it("answers read-only side questions without changing the active order step", () => {
    const source = read("src/server/conversations/whatsapp-active-order-side-intent.ts");
    expect(source).toContain("StorePaymentMethodService.listForStore");
    expect(source).toContain("canonicalPaymentGuidanceMessage");
    expect(source).toContain("buildWhatsAppMenuSummary");
    expect(source).toContain("buildWhatsAppCatalogAvailability");
    expect(source).toContain("buildWhatsAppCatalogPrice");
    expect(source).toContain("activeOrderTrackingCodeFromInput(input.text)");
    expect(source).toContain("nextStep: input.step");
    expect(source).toContain("Seu pedido em montagem continua salvo exatamente de onde estava");
  });

  it("lets an enabled payment selection continue through the canonical order payment parser", () => {
    const source = read("src/server/conversations/whatsapp-active-order-side-intent.ts");
    expect(source).toContain('input.step === "order_payment" && selection');
    expect(source).toContain("return null");
  });

  it("checks tracking ownership and canonical workflow status instead of inventing a status", () => {
    const source = read("src/server/conversations/whatsapp-active-order-side-intent.ts");
    expect(source).toContain('admin.from("orders")');
    expect(source).toContain("phonesBelongToSameCustomer");
    expect(source).toContain('admin.from("store_operational_settings")');
    expect(source).toContain("visibleWorkflowStage");
    expect(source).toContain("buildOrderLookupMessage");
  });

  it("runs the side-intent guard before the canonical order parser", () => {
    const source = read("src/server/conversations/whatsapp-smart-order-service.ts");
    const sideIntentAt = source.indexOf("answerActiveOrderSideIntent(input)");
    const canonicalAt = source.indexOf("const result = await EnhancedWhatsAppOrderService.handle");
    expect(sideIntentAt).toBeGreaterThan(-1);
    expect(canonicalAt).toBeGreaterThan(sideIntentAt);
  });
});
