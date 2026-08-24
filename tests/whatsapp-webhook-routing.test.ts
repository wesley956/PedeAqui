import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("WhatsApp webhook routing", () => {
  it("validates the Meta signature before ingesting any routed event", () => {
    const route = read("src/app/api/webhooks/whatsapp/route.ts");
    const signatureCheck = route.indexOf("verifyMetaWebhookSignature");
    const normalIngest = route.indexOf("ConversationService.ingestWhatsAppEvent");
    const coexistenceIngest = route.indexOf("WhatsAppCoexistenceService.ingest");
    expect(signatureCheck).toBeGreaterThan(-1);
    expect(normalIngest).toBeGreaterThan(signatureCheck);
    expect(coexistenceIngest).toBeGreaterThan(signatureCheck);
  });

  it("acknowledges signed Meta test events without persisting an unknown Phone Number ID", () => {
    const route = read("src/app/api/webhooks/whatsapp/route.ts");
    const routing = read("src/server/conversations/webhook-routing.ts");
    expect(routing).toContain("resolveWhatsAppAppSecret()");
    expect(route).toContain("configuredPhoneNumberIds.has(event.phoneNumberId)");
    expect(route).toContain("let ignored = 0");
    expect(route).toContain("ignored += 1");
    expect(route).toContain("{ ok: true, processed, ignored, requestId: requestContext.requestId }");
  });

  it("routes coexistence echoes and sync events separately from normal inbound messages", () => {
    const route = read("src/app/api/webhooks/whatsapp/route.ts");
    expect(route).toContain('event.kind === "echo" || event.kind === "sync"');
    expect(route).toContain("WhatsAppCoexistenceService.ingest(event)");
    expect(route.indexOf("WhatsAppCoexistenceService.ingest(event)")).toBeLessThan(route.indexOf("ConversationService.ingestWhatsAppEvent(event)"));
  });

  it("keeps real configured numbers scoped by the existing store channel settings", () => {
    const routing = read("src/server/conversations/webhook-routing.ts");
    expect(routing).toContain('.from("store_conversation_settings")');
    expect(routing).toContain('.eq("provider", "meta_cloud")');
    expect(routing).toContain('.eq("whatsapp_enabled", true)');
    expect(routing).toContain('.in("whatsapp_phone_number_id", ids)');
  });
});
