import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const accessPage = readFileSync(join(root, "src/app/acesso-entregador/page.tsx"), "utf8");
const protectedLayout = readFileSync(join(root, "src/app/(app)/layout.tsx"), "utf8");
const authActions = readFileSync(join(root, "src/features/auth/actions.ts"), "utf8");

describe("driver login entry", () => {
  it("provides a dedicated public login that always returns to the courier area", () => {
    expect(accessPage).toContain('title="Acesso do entregador"');
    expect(accessPage).toContain('name="next" value="/entregador"');
    expect(accessPage).toContain('name="entry" value="driver"');
    expect(accessPage).toContain("Entrar como entregador");
  });

  it("redirects unauthenticated courier routes to the dedicated entry", () => {
    expect(protectedLayout).toContain('pathname === "/entregador"');
    expect(protectedLayout).toContain('redirect("/acesso-entregador")');
  });

  it("keeps invalid driver credentials on the courier entry", () => {
    expect(authActions).toContain('entry === "driver"');
    expect(authActions).toContain('return `/acesso-entregador?error=${error}`');
  });
});
