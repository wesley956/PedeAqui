import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");
const board = read("src/features/orders/order-manager-board.tsx");
const customBoard = read("src/features/orders/custom-order-workflow-board.tsx");
const actions = read("src/features/orders/actions.ts");
const actionForm = read("src/features/orders/order-action-form.tsx");
const css = read("src/features/orders/order-manager.module.css");

describe("order manager click reduction", () => {
  it("combines accept and production start only in the simplified workflow", () => {
    expect(actionForm).toContain('| "accept_and_start"');
    expect(actions).toContain('"accept_and_start"');
    expect(actions).toContain("await OrderService.confirm(orderId)");
    expect(actions).toContain("await OrderService.startProduction(orderId)");
    expect(board).toContain('workflowMode === "simplified"');
    expect(board).toContain('{ intent: "accept_and_start", label: "Aceitar e iniciar" }');
    expect(customBoard).not.toContain('intent="accept_and_start"');
    expect(customBoard).toContain('intent="accept"');
  });

  it("keeps a single contextual primary action visible on operational cards", () => {
    expect(board).toContain("primaryActionForOrder");
    expect(board).toContain("styles.primaryAction");
    expect(board).toContain("styles.cardMore");
    expect(board).toContain("styles.compactMeta");
    expect(customBoard).toContain("styles.primaryAction");
    expect(customBoard).toContain("styles.cardMore");
  });

  it("moves rare or risky actions behind the compact More disclosure", () => {
    expect(board).toContain('<summary>Mais</summary>');
    expect(board).toContain("styles.rejectDetails");
    expect(board).toContain('intent="reject"');
    expect(board).toContain('intent="mark_paid"');
    expect(board).toContain("Abrir detalhes");
  });

  it("reduces card density without removing touch-friendly fallbacks", () => {
    expect(css).toContain(".orderCard { padding: var(--space-2) var(--space-3)");
    expect(css).toContain(".compactMeta");
    expect(css).toContain(".cardMore");
    expect(css).toContain(".primaryAction button { width: 100%; }");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("min-height: var(--control-height-lg)");
  });
});
