import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUserGuideSteps, guideProgress, type GuideReadiness } from "@/features/user-guide/guide-model";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
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

describe("automatic new-user guide", () => {
  it("builds an owner readiness checklist only from areas the user can actually access", () => {
    const steps = buildUserGuideSteps([
      { key: "dashboard", label: "Dashboard", href: "/dashboard" },
      { key: "catalog", label: "Cardápio", href: "/cardapio/produtos" },
      { key: "settings", label: "Configurações", href: "/configuracoes" },
      { key: "orders", label: "Pedidos", href: "/pedidos" },
    ], ["owner"], "restaurant", empty);

    expect(steps.map((step) => step.id)).toEqual([
      "welcome",
      "store-profile",
      "first-product",
      "business-hours",
      "payment-methods",
      "first-order",
      "ready",
    ]);
    expect(steps.some((step) => step.id === "delivery-settings")).toBe(false);
    expect(steps.some((step) => step.id === "driver-access")).toBe(false);
    expect(guideProgress(steps)).toEqual({ completed: 0, total: 5, percent: 0 });
  });

  it("adapts operational learning to the user's actual role and accessible areas", () => {
    const steps = buildUserGuideSteps([
      { key: "production", label: "Produção", href: "/producao" },
      { key: "orders", label: "Pedidos", href: "/pedidos" },
    ], ["kitchen"], "restaurant", empty);
    expect(steps.map((step) => step.id)).toEqual(["welcome", "learn-production", "learn-orders", "ready"]);
    expect(guideProgress(steps)).toEqual({ completed: 0, total: 0, percent: 100 });
  });

  it("keeps historical per-user progress protected by own-row RLS", () => {
    const migration = read("supabase/sql/102_new_user_guide.sql");
    expect(migration).toContain("primary key (user_id, guide_key)");
    expect(migration).toContain("user_id = auth.uid()");
    expect(migration).toContain("from auth.users");
    expect(migration).toContain("'restaurant_getting_started_v1'");
    expect(migration).toContain("'completed'");
    expect(migration).toContain("revoke all on table public.user_guides from anon");
  });

  it("persists through a server action and never trusts a browser supplied user id", () => {
    const actions = read("src/features/user-guide/actions.ts");
    const service = read("src/server/onboarding/user-guide-service.ts");
    expect(actions).toContain("requireAuthenticatedUser()");
    expect(actions).toContain("user_id: user.id");
    expect(actions).not.toContain("input.userId");
    expect(service).toContain('status === "in_progress" || status === "not_started"');
  });

  it("mounts globally, reads real readiness and remains manually reopenable", () => {
    const layout = read("src/app/(app)/layout.tsx");
    const shell = read("src/components/layout/app-shell.tsx");
    const guide = read("src/features/user-guide/new-user-guide.tsx");
    expect(layout).toContain("UserGuideService.load");
    expect(layout).toContain("OnboardingReadinessService.load");
    expect(layout).toContain("buildUserGuideSteps");
    expect(shell).toContain("<NewUserGuide");
    expect(guide).toContain("Fazer depois");
    expect(guide).toContain("Atualizar progresso");
    expect(guide).toContain("Ver checklist");
    expect(guide).toContain('searchParams.get("guia")');
  });
});
