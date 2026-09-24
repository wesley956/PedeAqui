import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("SAAS-05 tenant isolation surface contracts", () => {
  it("binds private conversation media signed URLs to the authorized organization and store", () => {
    const media = read("src/server/conversations/conversation-media-service.ts");
    expect(media).toContain("authorize(PERMISSIONS.CONVERSATIONS_VIEW)");
    expect(media).toContain('.eq("conversation_id", conversationId)');
    expect(media).toContain('.eq("organization_id", context.organizationId)');
    expect(media).toContain('.eq("store_id", context.storeId)');
    expect(media).toContain("createSignedUrl(");
    expect(media).toContain("60,");
  });

  it("routes WhatsApp webhooks by authoritative Meta Phone Number ID before ingesting events", () => {
    const route = read("src/app/api/webhooks/whatsapp/route.ts");
    const routing = read("src/server/conversations/webhook-routing.ts");
    expect(route).toContain("resolveWhatsAppWebhookRouting(webhookPhoneNumberIds(events))");
    expect(route).toContain("verifyMetaWebhookSignature");
    expect(route).toContain("routing.configuredPhoneNumberIds.has(event.phoneNumberId)");
    expect(routing).toContain('.eq("provider", "meta_cloud")');
    expect(routing).toContain('.eq("whatsapp_enabled", true)');
    expect(routing).toContain('.in("whatsapp_phone_number_id", ids)');
    expect(routing).toContain("configuredPhoneNumberIds.add(phoneNumberId)");
  });

  it("keeps order notification processing scoped to the job tenant", () => {
    const worker = read("src/server/conversations/order-notification-worker.ts");
    expect(worker).toContain('.eq("organization_id", job.organization_id)');
    expect(worker).toContain('.eq("store_id", job.store_id)');
    expect(worker).toContain("organizationId: job.organization_id");
    expect(worker).toContain("storeId: job.store_id");
  });

  it("does not trust organization/store cookies without server-side membership revalidation", () => {
    const context = read("src/server/access/context.ts");
    expect(context).toContain("requireAuthenticatedUser()");
    expect(context).toContain('.from("organization_members")');
    expect(context).toContain('.eq("user_id", user.id)');
    expect(context).toContain('.eq("status", "active")');
    expect(context).toContain('membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId)');
    expect(context).toContain('.eq("organization_id", membership.organization_id)');
    expect(context).toContain('storeQuery = storeQuery.eq("id", requestedStoreId)');
  });

  it("binds permission decisions to auth uid plus exact organization/store scope", () => {
    const rls = read("supabase/sql/02_rls_policies.sql");
    const wrapper = read("supabase/sql/05_access_rpc.sql");
    expect(rls).toContain("m.user_id = (select auth.uid())");
    expect(rls).toContain("m.organization_id = target_organization_id");
    expect(rls).toContain("usr.organization_id = target_organization_id");
    expect(rls).toContain("usr.store_id = target_store_id");
    expect(rls).toContain("usr.user_id = (select auth.uid())");
    expect(wrapper).toContain("security invoker");
    expect(wrapper).toContain("select private.has_permission(organization_id, store_id, permission_key)");
    expect(wrapper).toContain("revoke all on function public.has_permission(uuid, uuid, text) from public");
    expect(wrapper).toContain("grant execute on function public.has_permission(uuid, uuid, text) to authenticated");
  });
});
