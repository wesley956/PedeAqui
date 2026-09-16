import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260916150000_wpp04_inbox_pagination.sql", "utf8");
const service = readFileSync("src/server/conversations/conversation-service.ts", "utf8");
const inboxService = readFileSync("src/server/conversations/inbox-intelligence-service.ts", "utf8");
const realtime = readFileSync("src/features/conversations/conversation-realtime.tsx", "utf8");
const timeline = readFileSync("src/app/(app)/conversas/conversation-timeline.tsx", "utf8");
const page = readFileSync("src/app/(app)/conversas/page.tsx", "utf8");
const route = readFileSync("src/app/api/conversations/[conversationId]/messages/route.ts", "utf8");

describe("WPP-04 Inbox pagination/realtime", () => {
  it("adds tenant-scoped server-side inbox search and stable activity pagination", () => {
    expect(migration).toContain("conversation_inbox_page_internal");
    expect(migration).toContain("c.organization_id = p_organization_id");
    expect(migration).toContain("c.store_id = p_store_id");
    expect(migration).toContain("ct.name");
    expect(migration).toContain("ct.phone_normalized");
    expect(migration).toContain("p_unread_only");
    expect(migration).toContain("s.activity_at = p_before_activity");
    expect(migration).toContain("s.id < p_before_id");
    expect(migration).toContain("left join lateral");
    expect(migration).toContain("order by m.created_at desc, m.id desc");
    expect(migration).toContain("revoke all on function public.conversation_inbox_page_internal");
    expect(migration).toContain("grant execute on function public.conversation_inbox_page_internal");
  });

  it("removes fixed in-memory inbox search and the global preview-message cap", () => {
    expect(service).toContain('admin.rpc("conversation_inbox_page_internal"');
    expect(service).toContain("p_search: search || null");
    expect(service).toContain("p_unread_only: Boolean(options.unreadOnly)");
    expect(service).not.toContain(".limit(120)");
    expect(service).not.toContain(".limit(500)");
    expect(page).toContain("ConversationService.loadInbox({");
    expect(page).toContain("cursor: params.cursor");
    expect(page).not.toContain("visibleConversations");
    expect(page).toContain("Mais conversas");
  });

  it("pages message history with created_at plus id cursors in both directions", () => {
    expect(migration).toContain("conversation_message_page_internal");
    expect(migration).toContain("m.created_at = p_before_created_at");
    expect(migration).toContain("m.id < p_before_id");
    expect(migration).toContain("m.created_at = p_after_created_at");
    expect(migration).toContain("m.id > p_after_id");
    expect(service).toContain('admin.rpc("conversation_message_page_internal"');
    expect(service).toContain("previousCursor");
    expect(service).toContain("latestCursor");
    expect(service).toContain("hasOlder");
    expect(service).toContain("hasNewer");
    expect(inboxService).toContain("loadMessagePage");
    expect(page).toContain("initialPreviousCursor={detail.messagePagination.previousCursor}");
  });

  it("uses an authenticated tenant-scoped API route for history catch-up", () => {
    expect(route).toContain("InboxIntelligenceService.loadMessagePage");
    expect(route).toContain("if (before && after)");
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(service).toContain("authorize(PERMISSIONS.CONVERSATIONS_VIEW)");
    expect(service).toContain("await scopedConversation(conversationId, context.organizationId, storeId)");
  });

  it("deduplicates realtime catch-up by message id and supports reconnect", () => {
    expect(timeline).toContain("new Map(current.map((message) => [message.id, message]))");
    expect(timeline).toContain('event: "INSERT"');
    expect(timeline).toContain('event: "UPDATE"');
    expect(timeline).toContain("filter: `conversation_id=eq.${conversationId}`");
    expect(timeline).toContain('status === "SUBSCRIBED"');
    expect(timeline).toContain('status === "CHANNEL_ERROR"');
    expect(timeline).toContain('window.addEventListener("online", online)');
    expect(timeline).toContain("Carregar mensagens anteriores");
    expect(timeline).toContain("page.hasNewer");
  });

  it("keeps global realtime focused on list/unread projection instead of refreshing for every message row", () => {
    expect(realtime).toContain('table: "conversations"');
    expect(realtime).not.toContain('table: "messages"');
    expect(realtime).toContain("router.refresh()");
    expect(realtime).toContain('status === "CHANNEL_ERROR"');
    expect(realtime).toContain('document.addEventListener("visibilitychange", resume)');
  });

  it("preserves canonical authorship and does not introduce a parallel message store", () => {
    expect(inboxService).toContain('metadata.source === "whatsapp_business_app"');
    expect(inboxService).toContain('return "WhatsApp Business"');
    expect(timeline).toContain("message.authorLabel");
    expect(migration).not.toMatch(/create\s+table\s+.*(?:inbox|conversation)_messages/i);
    expect(service).not.toMatch(/from\(["'](?:carts|orders|customers)["']\)/);
  });
});
