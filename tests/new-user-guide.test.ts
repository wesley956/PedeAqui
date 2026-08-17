import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUserGuideSteps } from "@/features/user-guide/guide-model";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("automatic new-user guide", () => {
  it("builds a short owner journey only from navigation the user can actually access", () => {
    const steps = buildUserGuideSteps([
      { key: "dashboard", label: "Dashboard", href: "/dashboard" },
      { key: "catalog", label: "Cardápio", href: "/cardapio/produtos" },
      { key: "settings", label: "Configurações", href: "/configuracoes" },
      { key: "orders", label: "Pedidos", href: "/pedidos" },
    ], ["owner"]);

    expect(steps.map((step) => step.id)).toEqual(["welcome", "dashboard", "catalog", "settings", "orders", "ready"]);
    expect(steps.some((step) => step.id === "finance")).toBe(false);
  });

  it("adapts the journey for operational roles", () => {
    const steps = buildUserGuideSteps([
      { key: "production", label: "Produção", href: "/producao" },
      { key: "orders", label: "Pedidos", href: "/pedidos" },
    ], ["kitchen"]);
    expect(steps.map((step) => step.id)).toEqual(["welcome", "production", "orders", "ready"]);
  });

  it("stores progress per authenticated user with own-row RLS and protects existing accounts from surprise auto-open", () => {
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

  it("mounts globally in the protected shell and remains manually reopenable", () => {
    const layout = read("src/app/(app)/layout.tsx");
    const shell = read("src/components/layout/app-shell.tsx");
    const guide = read("src/features/user-guide/new-user-guide.tsx");
    expect(layout).toContain("UserGuideService.load");
    expect(layout).toContain("buildUserGuideSteps");
    expect(shell).toContain("<NewUserGuide");
    expect(guide).toContain("Continuar guia");
    expect(guide).toContain("Pular por agora");
    expect(guide).toContain("Concluir guia");
  });
});
