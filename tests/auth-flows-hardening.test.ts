import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/auth/safe-return-path";

const root = process.cwd();
function read(relativePath: string) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }

describe("authentication flow hardening", () => {
  it("allows internal destinations and rejects external redirect shapes", () => {
    expect(safeInternalPath("/pedidos?filtro=abertos#topo")).toBe("/pedidos?filtro=abertos#topo");
    expect(safeInternalPath("https://example.com/phish", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("//example.com/phish", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/\\example.com/phish", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath(null, "/dashboard")).toBe("/dashboard");
  });

  it("uses the same safe redirect contract in login and PKCE callback", () => {
    const actions = read("src/features/auth/actions.ts");
    const callback = read("src/app/auth/callback/route.ts");
    expect(actions).toContain("safeInternalPath");
    expect(callback).toContain("safeInternalPath");
    expect(callback).toContain("exchangeCodeForSession");
    expect(callback).not.toContain('url.searchParams.get("next") ??');
  });

  it("checks a live recovery session before changing password", () => {
    const actions = read("src/features/auth/actions.ts");
    expect(actions).toContain("supabase.auth.getUser()");
    expect(actions).toContain("session_expired");
    expect(actions).toContain("supabase.auth.updateUser");
  });

  it("keeps password reset response account-enumeration resistant", () => {
    const actions = read("src/features/auth/actions.ts");
    expect(actions).toContain("resetPasswordForEmail");
    expect(actions).toContain('redirect("/recuperar-senha?status=sent")');
    expect(actions).not.toMatch(/user[_ -]?not[_ -]?found/i);
  });

  it("documents the current leaked-password advisor recommendation", () => {
    const doc = read("docs/security/AUTH_QA_307.md");
    expect(doc).toContain("auth_leaked_password_protection");
    expect(doc).toContain("PKCE");
    expect(doc).toContain("password-security");
  });
});
