import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOperationalStartRoute } from "@/components/layout/start-route";
import { MAX_CATALOG_IMAGE_BYTES, validateCatalogImage } from "@/server/catalog/catalog-image-policy";
import type { ShellNavigationItem } from "@/components/layout/desktop-navigation";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const item = (key: string, href: string): ShellNavigationItem => ({ key, href, label: key, group: "administration", priority: "secondary" });

describe("presentation diagnostics PA-DIAG-011 to PA-DIAG-015", () => {
  it("prioritizes the specialist financial surface", () => {
    expect(resolveOperationalStartRoute(["administrative"], [
      item("dashboard", "/dashboard"),
      item("finance", "/financeiro"),
      item("catalog", "/cardapio/produtos"),
    ])).toBe("/financeiro");
  });

  it("keeps catalog images below the Vercel function payload limit", () => {
    expect(MAX_CATALOG_IMAGE_BYTES).toBe(4 * 1024 * 1024);
    expect(() => validateCatalogImage({ size: MAX_CATALOG_IMAGE_BYTES, type: "image/jpeg" })).not.toThrow();
    expect(() => validateCatalogImage({ size: MAX_CATALOG_IMAGE_BYTES + 1, type: "image/jpeg" })).toThrow("4 MB");
  });

  it("implements audited team CRUD without destructive member deletion", () => {
    const page = read("src/app/(app)/equipe/page.tsx");
    const actions = read("src/features/team/actions.ts");
    const service = read("src/server/team/team-management-service.ts");
    const migration = read("supabase/sql/115_team_management.sql");

    expect(page).toContain("createTeamInvitationFormAction");
    expect(page).toContain("suspendTeamMemberAction");
    expect(page).toContain("cancelTeamInvitationAction");
    expect(actions).toContain("InvitationService.create");
    expect(service).toContain("authorizeOrganization(PERMISSIONS.TEAM_MANAGE)");
    expect(service).toContain('rpc("team_suspend_member_internal"');
    expect(service).toContain('rpc("team_cancel_invitation_internal"');
    expect(migration).toContain("cannot suspend own access");
    expect(migration).toContain("owner access cannot be suspended here");
    expect(migration).toContain("team.member_suspended");
    expect(migration).toContain("team.invitation_canceled");
    expect(migration).not.toMatch(/delete from public\.organization_members/i);
    expect(migration).not.toMatch(/delete from public\.invitations/i);
  });

  it("documents the live RLS evidence and every issue in the batch", () => {
    const doc = read("docs/qa/PRESENTATION_DIAGNOSTICS_011_015_20260822.md");
    for (const id of ["PA-DIAG-011", "PA-DIAG-012", "PA-DIAG-013", "PA-DIAG-014", "PA-DIAG-015"]) expect(doc).toContain(id);
    expect(doc).toContain("organizações estrangeiras visíveis: `0`");
    expect(doc).toContain("FUNCTION_PAYLOAD_TOO_LARGE");
    expect(doc).toContain("Tudo terminou em `ROLLBACK`");
  });
});
