import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("SAAS-05 tenant isolation certification contracts", () => {
  it("never trusts organization/store cookies without authenticated membership revalidation", () => {
    const source = read("src/server/access/context.ts");

    expect(source).toContain("requireAuthenticatedUser()");
    expect(source).toContain('.from("organization_members")');
    expect(source).toContain('.eq("user_id", user.id)');
    expect(source).toContain('.eq("status", "active")');
    expect(source).toContain('membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId)');
    expect(source).toContain('.from("stores")');
    expect(source).toContain('.eq("organization_id", membership.organization_id)');
    expect(source).toContain('storeQuery = storeQuery.eq("id", requestedStoreId)');
  });

  it("binds signed conversation media URLs to permission, organization, store and conversation", () => {
    const source = read("src/server/conversations/conversation-media-service.ts");

    expect(source).toContain("authorize(PERMISSIONS.CONVERSATIONS_VIEW)");
    expect(source).toContain('.eq("id", mediaId)');
    expect(source).toContain('.eq("conversation_id", conversationId)');
    expect(source).toContain('.eq("organization_id", context.organizationId)');
    expect(source).toContain('.eq("store_id", context.storeId)');
    expect(source).toContain("createSignedUrl(");
    expect(source).toContain("60,");
  });

  it("resolves inbound WhatsApp media tenant from authoritative phone_number_id before claiming media", () => {
    const source = read("src/server/conversations/conversation-media-service.ts");

    expect(source).toContain('.eq("provider", "meta_cloud")');
    expect(source).toContain('.eq("whatsapp_phone_number_id", phoneNumberId)');
    expect(source).toContain('.select("organization_id,store_id,whatsapp_enabled,access_token_secret_ref")');
    expect(source).toContain('.eq("organization_id", settings.organization_id)');
    expect(source).toContain('.eq("store_id", settings.store_id)');
  });

  it("keeps media completion/failure updates scoped to the original organization and store", () => {
    const source = read("src/server/conversations/conversation-media-service.ts");

    const scopedUpdate = '.eq("id", row.id).eq("organization_id", row.organization_id).eq("store_id", row.store_id)';
    expect(source.match(new RegExp(scopedUpdate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
