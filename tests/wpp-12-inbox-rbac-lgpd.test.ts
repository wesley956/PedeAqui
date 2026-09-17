import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const conversationService = read("src/server/conversations/conversation-service.ts");
const claimService = read("src/server/conversations/conversation-claim-service.ts");
const mediaService = read("src/server/conversations/conversation-media-service.ts");
const inboxContext = read("src/server/conversations/inbox-context-service.ts");
const settingsService = read("src/server/conversations/settings-service.ts");
const embeddedSignupService = read("src/server/conversations/meta-embedded-signup-service.ts");
const automationCapabilityService = read("src/server/conversations/whatsapp-automation-capability-service.ts");
const embeddedSignupActions = read("src/features/conversations/meta-embedded-signup-actions.ts");
const settingsPage = read("src/app/(app)/configuracoes/conversas/page.tsx");
const settingsHub = read("src/app/(app)/configuracoes/page.tsx");
const messagesRoute = read("src/app/api/conversations/[conversationId]/messages/route.ts");
const mediaRoute = read("src/app/api/conversations/[conversationId]/media/[mediaId]/route.ts");

describe("WPP-12 Inbox RBAC, tenant isolation and minimization", () => {
  it("keeps view, reply and handoff as separate operational permissions", () => {
    expect(conversationService).toContain("authorize(PERMISSIONS.CONVERSATIONS_VIEW)");
    expect(conversationService).toContain("authorize(PERMISSIONS.CONVERSATIONS_REPLY)");
    expect(conversationService).toContain("authorize(PERMISSIONS.CONVERSATIONS_MANAGE)");
    expect(claimService).toContain("authorize(PERMISSIONS.CONVERSATIONS_MANAGE)");

    const sendText = conversationService.slice(
      conversationService.indexOf("static async sendAgentText"),
      conversationService.indexOf("static async sendAgentMedia"),
    );
    expect(sendText).toContain("PERMISSIONS.CONVERSATIONS_REPLY");
    expect(sendText).not.toContain("PERMISSIONS.INTEGRATIONS_MANAGE");
  });

  it("requires integrations.manage for every WhatsApp configuration service", () => {
    for (const source of [settingsService, embeddedSignupService, automationCapabilityService]) {
      expect(source).toContain("PERMISSIONS.INTEGRATIONS_MANAGE");
      expect(source).not.toContain("PERMISSIONS.CONVERSATIONS_MANAGE");
    }
  });

  it("protects both the settings route and embedded signup browser action", () => {
    expect(settingsPage).toContain("await authorize(PERMISSIONS.INTEGRATIONS_MANAGE)");
    expect(embeddedSignupActions).toContain("await authorize(PERMISSIONS.INTEGRATIONS_MANAGE)");
  });

  it("does not advertise the configurable WhatsApp screen to operational-only users", () => {
    const definition = settingsHub.match(/whatsapp:\s*\{[^\n]+/u)?.[0] ?? "";
    expect(definition).toContain("PERMISSIONS.INTEGRATIONS_MANAGE");
    expect(definition).not.toContain("PERMISSIONS.CONVERSATIONS_VIEW");
    expect(definition).not.toContain("PERMISSIONS.INTEGRATIONS_VIEW");
  });

  it("minimizes customer identity when customer permission is restricted", () => {
    expect(inboxContext).toContain("linkedCustomerId: customerAllowed ? customerId : null");
    expect(inboxContext).toContain("canView(PERMISSIONS.CUSTOMERS_VIEW, access)");
    expect(inboxContext).toContain("canView(PERMISSIONS.ORDERS_VIEW, access)");
    expect(inboxContext).toContain('customer: customerAllowed ? "available" as const : "restricted" as const');
    expect(inboxContext).toContain('orders: ordersAllowed ? "available" as const : "restricted" as const');
  });

  it("keeps private media scoped by permission, organization, store, conversation and media id", () => {
    expect(mediaService).toContain("authorize(PERMISSIONS.CONVERSATIONS_VIEW)");
    for (const scope of [
      '.eq("id", mediaId)',
      '.eq("conversation_id", conversationId)',
      '.eq("organization_id", context.organizationId)',
      '.eq("store_id", context.storeId)',
    ]) {
      expect(mediaService).toContain(scope);
    }
    expect(mediaService).toContain("createSignedUrl(");
    expect(mediaService).toContain("60,");
    expect(mediaRoute).toContain('"Cache-Control": "private, no-store"');
  });

  it("keeps message pagination behind tenant-scoped conversation authorization", () => {
    expect(messagesRoute).toContain("InboxIntelligenceService.loadMessagePage");
    expect(conversationService).toContain("await scopedConversation(conversationId, context.organizationId, storeId)");
    expect(conversationService).toContain("p_organization_id: organizationId");
    expect(conversationService).toContain("p_store_id: storeId");
    expect(conversationService).toContain("p_conversation_id: conversationId");
  });

  it("does not introduce a WPP-12 database migration for an authorization-only change", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const migrations = fs.readdirSync("supabase/migrations");
    expect(migrations.some((name) => name.toLowerCase().includes("wpp12"))).toBe(false);
  });
});
