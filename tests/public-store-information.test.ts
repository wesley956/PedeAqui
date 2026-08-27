import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicMenuSchema } from "@/server/menu/schemas";

const read = (path: string) => readFileSync(path, "utf8");
const menuPage = read("src/app/m/[slug]/page.tsx");
const sheet = read("src/features/menu/store-information-sheet.tsx");
const sheetCss = read("src/features/menu/store-information-sheet.module.css");
const settings = read("src/app/(app)/configuracoes/loja/page.tsx");
const storeProfileService = read("src/server/stores/store-profile-service.ts");
const migration = read("supabase/sql/144_public_store_information.sql");

describe("PA-PUBLIC-UX-010 store information", () => {
  it("keeps the existing storefront and adds only the store information trigger", () => {
    expect(menuPage).toContain("MenuBrowser");
    expect(menuPage).toContain("PublicCartBar");
    expect(menuPage).toContain("StoreInformationSheet");
    expect(sheet).toContain("Informações da loja");
  });

  it("keeps new public RPC fields additive for existing menu payloads", () => {
    const parsed = publicMenuSchema.shape.store.parse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Loja",
      slug: "loja",
      phone: null,
      city: "Nova Odessa",
      state: "SP",
      timezone: "America/Sao_Paulo",
      status: "active",
      business_type: "restaurant",
    });
    expect(parsed.public_whatsapp).toBeNull();
    expect(parsed.instagram_url).toBeNull();
    expect(parsed.street).toBeNull();
  });

  it("publishes only deliberate store metadata and keeps administrative fields out", () => {
    for (const field of ["postal_code", "street", "number", "complement", "district", "public_whatsapp", "website_url", "instagram_url", "facebook_url", "tiktok_url"]) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(migration).not.toContain("s.email");
    expect(migration).not.toContain("whatsapp_phone_number_id");
    expect(migration).not.toContain("waba_id");
    expect(migration).toContain("private.get_public_store_information");
    expect(migration).toContain("jsonb_set(");
  });

  it("rejects unsafe public URLs in both application and database contracts", () => {
    expect(storeProfileService).toContain('protocol === "http:" || protocol === "https:"');
    expect(storeProfileService).toContain("Informe uma URL completa começando com http:// ou https://");
    expect(migration).toContain("^https?://[^[:space:]]+$");
    expect(settings).toContain("Uso administrativo. Não é publicado automaticamente");
    expect(sheet).not.toContain("store.email");
  });

  it("uses a native accessible dialog and PedeAqui responsive contracts", () => {
    expect(sheet).toContain("<dialog");
    expect(sheet).toContain("showModal()");
    expect(sheet).toContain("aria-labelledby=\"store-information-title\"");
    expect(sheet).toContain("triggerRef.current?.focus()");
    expect(sheetCss).toContain("env(safe-area-inset-bottom)");
    expect(sheetCss).toContain("@media(max-width:640px)");
    expect(sheetCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(sheetCss).toContain("var(--brand-primary)");
  });

  it("does not reuse technical Meta identifiers as public contact data", () => {
    expect(settings).toContain("Não usa IDs técnicos da Meta");
    expect(sheet).toContain("public_whatsapp");
    expect(sheet).not.toContain("whatsapp_phone_number_id");
    expect(sheet).not.toContain("waba");
  });
});
