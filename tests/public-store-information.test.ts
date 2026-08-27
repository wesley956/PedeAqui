import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicMenuSchema } from "@/server/menu/schemas";
import { storeProfileInputSchema } from "@/server/stores/store-profile-service";

const read = (path: string) => readFileSync(path, "utf8");
const menuPage = read("src/app/m/[slug]/page.tsx");
const sheet = read("src/features/menu/store-information-sheet.tsx");
const sheetCss = read("src/features/menu/store-information-sheet.module.css");
const settings = read("src/app/(app)/configuracoes/loja/page.tsx");

describe("PA-PUBLIC-UX-010 store information", () => {
  it("keeps the existing storefront and adds only the store information trigger", () => {
    expect(menuPage).toContain("MenuBrowser");
    expect(menuPage).toContain("PublicCartBar");
    expect(menuPage).toContain("StoreInformationSheet");
    expect(sheet).toContain("Informações da loja");
  });

  it("keeps new public RPC fields additive while the database migration rolls out", () => {
    const parsed = publicMenuSchema.parse({
      store: { id: "00000000-0000-4000-8000-000000000001", name: "Loja", slug: "loja", phone: null, city: "Nova Odessa", state: "SP", timezone: "America/Sao_Paulo", status: "active", business_type: "restaurant" },
      settings: { theme: "pedeaqui", primary_color: "#FF6B00", logo_url: null, cover_url: null, show_search: true, show_categories: true, show_product_images: true, allow_pickup: true, allow_delivery: true, minimum_order_cents: 0, active: true, accepting_orders: true, pause_reason: null },
      delivery: { enabled: false, fee_mode: "flat", starting_fee_cents: 0, estimated_min_minutes: 0, estimated_max_minutes: 0, free_delivery_over_cents: null },
      hours: [], categories: [],
    });
    expect(parsed.store.public_whatsapp).toBeNull();
    expect(parsed.store.instagram_url).toBeNull();
  });

  it("rejects unsafe public URLs and keeps administrative email separate", () => {
    const base = { name: "Loja", phone: "19999999999", email: "admin@example.com", postalCode: "", street: "", number: "", complement: "", district: "", city: "Nova Odessa", state: "SP", publicWhatsapp: "", websiteUrl: "", instagramUrl: "", facebookUrl: "", tiktokUrl: "" };
    expect(storeProfileInputSchema.safeParse({ ...base, websiteUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(storeProfileInputSchema.safeParse({ ...base, websiteUrl: "https://example.com" }).success).toBe(true);
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
