import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const accessPage = readFileSync(join(root, "src/app/acesso-entregador/page.tsx"), "utf8");
const protectedLayout = readFileSync(join(root, "src/app/(app)/layout.tsx"), "utf8");
const pinActions = readFileSync(join(root, "src/features/delivery/driver-pin-auth-actions.ts"), "utf8");

describe("driver login entry", () => {
  it("provides a dedicated public phone + PIN login for the courier area", () => {
    expect(accessPage).toContain('title="Acesso do entregador"');
    expect(accessPage).toContain('name="phone"');
    expect(accessPage).toContain('name="pin"');
    expect(accessPage).toContain("Abrir meu roteiro");
  });

  it("stays available even when another account is already logged in", () => {
    expect(accessPage).not.toContain("getAuthenticatedUser");
    expect(accessPage).not.toContain('redirect("/entregador")');
  });

  it("keeps the protected courier area behind the global authentication contract", () => {
    expect(protectedLayout).toContain("requireAuthenticatedUser()");
  });

  it("keeps PIN failures on the courier entry and exposes the temporary lock state", () => {
    expect(pinActions).toContain('redirect(`/acesso-entregador?error=${safeCode}`)');
    expect(accessPage).toContain("temporarily_locked");
    expect(accessPage).toContain("15 minutos");
  });
});
