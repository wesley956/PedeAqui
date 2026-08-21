import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const settings = read("src/app/(app)/configuracoes/entregadores/page.tsx");
const accessForm = read("src/features/delivery/driver-mobile-access-form.tsx");
const deliveryActions = read("src/features/delivery/actions.ts");
const accessService = read("src/server/delivery/driver-mobile-access-service.ts");
const pinService = read("src/server/delivery/driver-pin-auth-service.ts");
const firstAccessPage = read("src/app/primeiro-acesso-entregador/page.tsx");
const loginPage = read("src/app/acesso-entregador/page.tsx");
const migration = read("supabase/sql/114_driver_phone_pin_access.sql");

describe("driver mobile access", () => {
  it("lets the store generate a WhatsApp-first enrollment without email or technical ids", () => {
    expect(settings).toContain("DriverMobileAccessForm");
    expect(accessForm).toContain("Liberar acesso");
    expect(accessForm).toContain("Enviar no WhatsApp");
    expect(accessForm).toContain("Gerar novo link / redefinir PIN");
    expect(accessForm).not.toContain("name=\"email\"");
    expect(accessForm).not.toContain("UUID");
    expect(deliveryActions).toContain("createDriverMobileAccessAction");
    expect(accessService).toContain("driver_pin_access");
  });

  it("uses a one-time hashed enrollment token and never stores the raw PIN in public tables", () => {
    expect(accessService).toContain('createHash("sha256")');
    expect(accessService).toContain("enrollment_token_hash");
    expect(migration).toContain("enrollment_token_hash");
    expect(migration).not.toContain("pin_hash");
    expect(pinService).toContain("password: pin");
  });

  it("gives the driver a six-digit first access and daily phone + PIN login", () => {
    expect(firstAccessPage).toContain("Crie seu PIN de 6 números");
    expect(firstAccessPage).toContain("Ativar e abrir meu roteiro");
    expect(loginPage).toContain('name="phone"');
    expect(loginPage).toContain('name="pin"');
    expect(loginPage).toContain("Abrir meu roteiro");
    expect(pinService).toContain("signInWithPassword({ phone, password: pin })");
  });

  it("locks brute-force attempts and keeps activation scoped to the driver store", () => {
    expect(migration).toContain("failed_attempts");
    expect(migration).toContain("locked_until");
    expect(migration).toContain("interval '15 minutes'");
    expect(migration).toContain("user_store_roles");
    expect(migration).toContain("driver PIN cannot replace credentials of a non-driver account");
  });
});
