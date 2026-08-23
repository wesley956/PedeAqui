import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/server/delivery/driver-pin-auth-service.ts"),
  "utf8",
);

describe("driver PIN auth provider boundary", () => {
  it("keeps phone as the public identifier without depending on Supabase Phone Auth", () => {
    expect(source).toContain("driverCredentialEmail");
    expect(source).toContain("@auth.pedeaqui.invalid");
    expect(source).toContain("email: credentialEmail");
    expect(source).toContain("email: driverCredentialEmail(access.driver_id)");
    expect(source).not.toContain("signInWithPassword({\n      phone:");
  });

  it("still resolves the driver by normalized phone before authenticating", () => {
    expect(source).toContain('.eq("phone_e164", phone)');
    expect(source).toContain('register_driver_pin_failure');
    expect(source).toContain('register_driver_pin_success');
  });
});
