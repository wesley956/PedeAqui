import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUserGuideSteps, guideProgress, USER_GUIDE_KEY, type GuideReadiness } from "@/features/user-guide/guide-model";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");
const items = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "catalog", label: "Cardápio", href: "/cardapio" },
  { key: "settings", label: "Configurações", href: "/configuracoes" },
  { key: "orders", label: "Pedidos", href: "/pedidos" },
  { key: "deliveries", label: "Entregas", href: "/entregas" },
  { key: "driver", label: "Meu roteiro", href: "/entregador" },
];

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

describe("smart onboarding guide", () => {
  it("versions the new onboarding independently from the legacy quick guide", () => {
    expect(USER_GUIDE_KEY).toBe("pedeaqui_smart_onboarding_v2");
  });

  it("builds an owner checklist from real operational readiness", () => {
    const steps = buildUserGuideSteps(items, ["owner"], "gas", empty);
    expect(steps.some((step) => step.id === "first-product" && step.state === "todo")).toBe(true);
    expect(steps.some((step) => step.id === "driver-access" && step.state === "todo")).toBe(true);
    expect(steps.some((step) => step.tip?.includes("telefone + PIN"))).toBe(true);
    const progress = guideProgress(steps);
    expect(progress.total).toBeGreaterThan(0);
    expect(progress.completed).toBe(0);
  });

  it("marks checklist tasks automatically when the store already has real data", () => {
    const ready: GuideReadiness = {
      ...empty,
      storeProfileComplete: true,
      productCount: 4,
      hoursCount: 7,
      paymentMethodCount: 3,
      deliveryConfigured: true,
      driverCount: 2,
      driverMobileAccessCount: 1,
      orderCount: 8,
    };
    const steps = buildUserGuideSteps(items, ["owner"], "restaurant", ready);
    const progress = guideProgress(steps);
    expect(progress.completed).toBe(progress.total);
    expect(progress.percent).toBe(100);
  });

  it("keeps operational roles focused on learning only their accessible areas", () => {
    const steps = buildUserGuideSteps([{ key: "driver", label: "Meu roteiro", href: "/entregador" }], ["driver"], "gas", empty);
    expect(steps.some((step) => step.id === "learn-driver" && step.href === "/entregador")).toBe(true);
    expect(steps.filter((step) => step.state !== "info")).toHaveLength(0);
  });

  it("uses a floating coach and real-state refresh instead of a text-only next/previous tour", () => {
    const component = read("src/features/user-guide/new-user-guide.tsx");
    const readiness = read("src/server/onboarding/onboarding-readiness-service.ts");
    expect(component).toContain("Verificar progresso");
    expect(component).toContain("O progresso real é detectado automaticamente");
    expect(component).toContain('searchParams.get("guia")');
    expect(readiness).toContain('from("products")');
    expect(readiness).toContain('from("store_payment_methods")');
    expect(readiness).toContain('from("drivers")');
    expect(readiness).toContain('from("orders")');
  });
});
