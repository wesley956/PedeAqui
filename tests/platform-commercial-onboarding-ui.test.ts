import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("commercial mobile UI [349]", () => {
  it("surfaces one-tap demo and restaurant creation in the owner panel", () => {
    const page = read("src/app/platform/page.tsx");
    expect(page).toContain('href="/platform/demo"');
    expect(page).toContain("Abrir demonstração");
    expect(page).toContain('href="/platform/novo-restaurante"');
    expect(page).toContain("Novo restaurante");
    expect(page).toContain("WhatsApp para configurar depois");
  });

  it("keeps the creation form intentionally minimal", () => {
    const page = read("src/app/platform/novo-restaurante/page.tsx");
    expect(page).toContain('name="organizationName"');
    expect(page).toContain('name="storeName"');
    expect(page).toContain('name="ownerEmail"');
    expect(page).not.toContain('name="whatsapp"');
    expect(page).not.toContain('name="password"');
  });
});
