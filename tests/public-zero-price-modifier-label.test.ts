import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const selector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");

describe("public zero-price modifier labels", () => {
  it("does not render the word Incluso for zero-price options", () => {
    expect(selector).not.toContain('"Incluso"');
    expect(selector).toContain("modifier.price_cents > 0 ? <strong>+ {money(modifier.price_cents)}</strong> : null");
    expect(selector).toContain("modifier.price_cents > 0 ? <strong className={styles.optionPrice}>+ {money(modifier.price_cents)} cada</strong> : null");
  });
});
