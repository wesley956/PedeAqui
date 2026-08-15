import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("src/server/platform/platform-account-support-service.ts");
const actions = read("src/features/platform-account-support/actions.ts");
const page = read("src/app/platform/suporte/page.tsx");
const layout = read("src/app/platform/layout.tsx");

describe("Platform account support [342]", () => {
  it("keeps target account data masked in the support read model", () => {
    expect(service).toContain("maskEmail");
    expect(service).toContain("emailMasked");
    expect(page).toContain("e-mail mascarado");
    expect(page).not.toContain('type="email"');
  });

  it("uses the official password recovery flow and never sets or reveals a password", () => {
    expect(service).toContain("resetPasswordForEmail");
    expect(service).toContain("/auth/callback?next=/nova-senha");
    expect(service).not.toMatch(/updateUserById\([^)]*password/s);
    expect(page).toContain("A senha atual nunca fica visível para o suporte");
  });

  it("reissues invitations without exposing the raw token to the operator", () => {
    expect(service).toContain('randomBytes(32).toString("base64url")');
    expect(service).toContain('createHash("sha256")');
    expect(service).toContain("signInWithOtp");
    expect(service).toContain("inviteUserByEmail");
    expect(page).toContain("O token anterior é invalidado");
    expect(actions).not.toContain("rawToken");
  });

  it("requires elevated permission for membership and store-role mutations", () => {
    expect(service).toContain("platformAccess(true)");
    expect(service).toContain('targetRole.key === "owner"');
    expect(service).toContain('z.literal("ALTERAR ACESSO")');
    expect(page).toContain("owner não é oferecida nesta central");
  });

  it("validates tenant relationships server-side and audits interventions", () => {
    expect(service).toContain('.eq("organization_id", organizationId)');
    expect(service).toContain('from("audit_logs").insert');
    expect(service).toContain("support_reason");
    expect(service).toContain("idempotency_keys");
    expect(page).toContain('name="reason"');
    expect(page).toContain('name="protocol"');
    expect(page).toContain('name="idempotencyKey"');
  });

  it("does not fake session revocation without a target session JWT", () => {
    expect(service).not.toContain("auth.admin.signOut");
    expect(page).toContain("exige o JWT da própria sessão-alvo");
    expect(page).toContain("A central não coleta nem expõe esse token");
  });

  it("exposes the support center in the platform navigation", () => {
    expect(layout).toContain('["Suporte", "/platform/suporte"]');
    expect(actions).toContain('revalidatePath("/platform/suporte")');
  });
});
