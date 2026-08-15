import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMetaWebhookSignature } from "@/server/conversations/whatsapp-webhook";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("WhatsApp Cloud API live readiness [325]", () => {
  const provider = read("src/server/conversations/provider.ts");
  const settings = read("src/server/conversations/settings-service.ts");
  const route = read("src/app/api/webhooks/whatsapp/route.ts");
  const service = read("src/server/conversations/conversation-service.ts");
  const page = read("src/app/(app)/configuracoes/conversas/page.tsx");

  it("verifies Meta HMAC over the exact raw request body", () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const secret = "test-app-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    expect(verifyMetaWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyMetaWebhookSignature(`${raw} `, signature, secret)).toBe(false);
    expect(verifyMetaWebhookSignature(raw, "sha256=bad", secret)).toBe(false);
  });

  it("keeps secrets server-side and stores only secret references", () => {
    expect(settings).toContain("accessTokenSecretRef");
    expect(settings).toContain("appSecretSecretRef");
    expect(settings).toContain("access_token_secret_ref");
    expect(settings).toContain("app_secret_secret_ref");
    expect(provider).toContain("process.env[envName]");
    expect(page).toContain("Tokens e App Secret nunca ficam expostos no navegador");
    expect(page).not.toContain("process.env.WHATSAPP_ACCESS_TOKEN");
    expect(page).not.toContain("process.env.WHATSAPP_APP_SECRET");
  });

  it("bounds provider calls and checks the configured Phone Number ID", () => {
    expect(provider).toContain("AbortSignal.timeout(PROVIDER_TIMEOUT_MS)");
    expect(provider).toContain("id,display_phone_number,verified_name,quality_rating");
    expect(provider).toContain("payload.id !== phoneNumberId");
    expect(provider).toContain("encodeURIComponent(phoneNumberId)");
  });

  it("distinguishes safe channel health states without returning credentials", () => {
    for (const status of ["disabled", "misconfigured", "connected", "provider_unavailable", "invalid_credentials"]) {
      expect(settings).toContain(`\"${status}\"`);
    }
    expect(settings).toContain("displayPhoneNumber");
    expect(settings).toContain("verifiedName");
    expect(settings).toContain("qualityRating");
    expect(settings).not.toContain("accessToken: string | null");
    expect(settings).not.toContain("appSecret: string | null");
  });

  it("rejects oversized/invalid webhooks before ingestion and validates signature first", () => {
    expect(route).toContain("rawBody.length > 1_000_000");
    expect(route).toContain("Invalid JSON");
    const signatureAt = route.indexOf("verifyMetaWebhookSignature");
    const ingestAt = route.indexOf("ingestWhatsAppEvent(event)");
    expect(signatureAt).toBeGreaterThan(-1);
    expect(ingestAt).toBeGreaterThan(signatureAt);
    expect(route).not.toContain("console.log(rawBody)");
    expect(route).not.toContain("x-hub-signature-256:");
  });

  it("keeps inbound/outbound scoped by store phone number and provider IDs", () => {
    expect(service).toContain("whatsapp_phone_number_id");
    expect(service).toContain("event.phoneNumberId");
    expect(service).toContain("p_external_message_id");
    expect(service).toContain("p_client_message_id");
    expect(service).toContain("conversation_update_delivery_internal");
  });
});
