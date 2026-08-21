import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const settings = read("src/app/(app)/configuracoes/entregadores/page.tsx");
const accessForm = read("src/features/delivery/driver-mobile-access-form.tsx");
const deliveryActions = read("src/features/delivery/actions.ts");
const accessService = read("src/server/delivery/driver-mobile-access-service.ts");
const inviteActions = read("src/features/team/actions.ts");
const invitePage = read("src/app/convite/page.tsx");
const signupPage = read("src/app/cadastro/page.tsx");
const authActions = read("src/features/auth/actions.ts");
const migration = read("supabase/sql/113_driver_mobile_access.sql");

describe("driver mobile access", () => {
  it("exposes a friendly access flow without technical user ids", () => {
    expect(settings).toContain("DriverMobileAccessForm");
    expect(settings).toContain("acesso mobile pendente");
    expect(accessForm).toContain("Liberar acesso mobile");
    expect(accessForm).toContain("Enviar no WhatsApp");
    expect(accessForm).toContain("Enviar por e-mail");
    expect(accessForm).not.toContain("userId");
    expect(accessForm).not.toContain("UUID");
  });

  it("creates a store-scoped driver role invitation and maps it to the driver", () => {
    expect(accessService).toContain('.eq("key", "driver")');
    expect(accessService).toContain("InvitationService.create");
    expect(accessService).toContain('storeIds: [context.storeId]');
    expect(accessService).toContain('from("driver_access_invitations")');
    expect(deliveryActions).toContain("createDriverMobileAccessAction");
  });

  it("lets first-time drivers create an account and return to the invitation", () => {
    expect(invitePage).toContain("Primeiro acesso · Criar conta");
    expect(signupPage).toContain('name="next"');
    expect(authActions).toContain("emailRedirectTo");
    expect(authActions).toContain("encodeURIComponent(returnPath)");
  });

  it("links the authenticated user atomically and sends drivers to their mobile route", () => {
    expect(migration).toContain("driver_access_invitations");
    expect(migration).toContain("set user_id = actor_id");
    expect(migration).toContain("driver access already linked to another user");
    expect(migration).toContain("user already linked to another driver in this store");
    expect(migration).toContain("next_path := '/entregador'");
    expect(inviteActions).toContain("result.next_path");
  });
});
