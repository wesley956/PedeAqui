import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUserGuideSteps, type GuideReadiness } from "@/features/user-guide/guide-model";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
const empty: GuideReadiness = {
  storeProfileComplete: false,
  storeSlug: "loja-teste",
  productCount: 0,
  hoursCount: 0,
  paymentMethodCount: 0,
  deliveryConfigured: false,
  driverCount: 0,
  driverMobileAccessCount: 0,
  orderCount: 0,
};

describe("store profile settings", () => {
  it("sends the first onboarding task directly to the store profile editor", () => {
    const steps = buildUserGuideSteps([
      { key: "settings", label: "Configurações", href: "/configuracoes" },
    ], ["owner"], "restaurant", empty);
    expect(steps.find((step) => step.id === "store-profile")?.href).toBe("/configuracoes/loja");
  });

  it("exposes the fields required by onboarding and keeps the public slug read-only", () => {
    const page = read("src/app/(app)/configuracoes/loja/page.tsx");
    const service = read("src/server/stores/store-profile-service.ts");
    expect(page).toContain('name="name"');
    expect(page).toContain('name="phone"');
    expect(page).toContain('name="city"');
    expect(page).toContain('name="state"');
    expect(page).toContain("Trocar o nome da loja não muda este link");
    expect(service).toContain('name: values.name');
    expect(service).not.toContain('slug: values');
  });

  it("links store data and menu identity as separate settings", () => {
    const hub = read("src/app/(app)/configuracoes/page.tsx");
    expect(hub).toContain('href: "/configuracoes/loja"');
    expect(hub).toContain('href: "/configuracoes/cardapio"');
    expect(hub).toContain('title: "Dados da loja"');
    expect(hub).toContain('title: "Cardápio e identidade"');
  });

  it("updates only the active tenant store and records the change", () => {
    const service = read("src/server/stores/store-profile-service.ts");
    expect(service).toContain("authorize(PERMISSIONS.STORES_MANAGE)");
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("id", storeId)');
    expect(service).toContain('action: "store.profile_updated"');
  });
});
