import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const page = fs.readFileSync(path.join(root, "src/app/privacidade/page.tsx"), "utf8");
const proxy = fs.readFileSync(path.join(root, "src/lib/supabase/proxy.ts"), "utf8");

describe("public privacy policy", () => {
  it("documents the data categories and core operational purposes used by PedeAqui", () => {
    expect(page).toContain("Política de Privacidade");
    expect(page).toContain("número de telefone/WhatsApp");
    expect(page).toContain("endereço de entrega");
    expect(page).toContain("itens do pedido");
    expect(page).toContain("WhatsApp Business Platform");
    expect(page).toContain("Direitos do titular");
    expect(page).toContain("Exclusão de dados");
  });

  it("keeps the privacy route outside authenticated prefixes", () => {
    const protectedPrefixes = proxy.match(/PROTECTED_PREFIXES\s*=\s*\[([^\]]+)\]/s)?.[1] ?? "";
    expect(protectedPrefixes).not.toContain("/privacidade");
  });
});
