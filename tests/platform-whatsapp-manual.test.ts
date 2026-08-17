import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const service = read("src/server/platform/platform-whatsapp-manual-service.ts");
const page = read("src/app/platform/unidades/[storeId]/whatsapp/page.tsx");
const actions = read("src/app/platform/unidades/[storeId]/whatsapp/actions.ts");
const resolver = read("src/app/platform/restaurantes/[storeId]/page.tsx");
const unit360 = read("src/app/platform/empresas/[organizationId]/unidades/[storeId]/page.tsx");

describe("platform manual WhatsApp connection", () => {
  it("uses the permanent platform credential and never accepts raw tokens from the form", () => {
    expect(service).toContain("META_SYSTEM_USER_ACCESS_TOKEN");
    expect(service).toContain('access_token_secret_ref: "META_SYSTEM_USER_ACCESS_TOKEN"');
    expect(service).toContain('app_secret_secret_ref: "WHATSAPP_APP_SECRET"');
    expect(page).not.toContain('name="accessToken"');
    expect(page).not.toContain('name="appSecret"');
    expect(actions).not.toContain("accessToken");
    expect(actions).not.toContain("appSecret");
  });

  it("validates ownership, webhook subscription and phone health before persisting connected", () => {
    expect(service).toContain("verifyPhoneBelongsToWaba");
    expect(service).toContain("/phone_numbers?fields=id&limit=200");
    expect(service).toContain("/subscribed_apps");
    expect(service).toContain("inspectPhoneNumber");
    expect(service).toContain('connection_status: "connected"');
    expect(service).toContain('onboarding_status: "completed"');
  });

  it("prevents one Phone Number ID from being attached to two stores", () => {
    expect(service).toContain('.eq("whatsapp_phone_number_id", input.phoneNumberId)');
    expect(service).toContain('.neq("store_id", input.storeId)');
    expect(service).toContain("duplicate_phone");
  });

  it("supports repairing legacy credentials and keeps navigation available from platform screens", () => {
    expect(service).toContain("static async revalidate");
    expect(actions).toContain("revalidateManualWhatsAppAction");
    expect(resolver).toContain("/whatsapp");
    expect(unit360).toContain("Configurar WhatsApp");
  });
});
