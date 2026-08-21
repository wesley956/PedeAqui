import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const navigation = readFileSync(join(process.cwd(), "src/components/layout/navigation-model.ts"), "utf8");
const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");

describe("driver account restriction", () => {
  it("surfaces only Meu roteiro in the pure delivery context", () => {
    expect(navigation).toContain("delivery: { driver:P, deliveries:H, orders:H");
  });

  it("redirects a pure driver away from other protected panel routes", () => {
    expect(layout).toContain('navigationAccess.operationalContexts.length === 1');
    expect(layout).toContain('navigationAccess.operationalContexts[0] === "delivery"');
    expect(layout).toContain('redirect("/entregador")');
  });
});
