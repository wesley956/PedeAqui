import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260917214500_wpp07_atomic_human_claim.sql", "utf8");
const claimService = readFileSync("src/server/conversations/conversation-claim-service.ts", "utf8");
const actions = readFileSync("src/features/conversations/actions.ts", "utf8");
const page = readFileSync("src/app/(app)/conversas/page.tsx", "utf8");
const conversationService = readFileSync("src/server/conversations/conversation-service.ts", "utf8");

 describe("WPP-07 atomic human claim hardening", () => {
  it("serializes claims and scopes them to organization/store", () => {
    expect(migration).toContain("conversation_claim_human_internal");
    expect(migration).toContain("organization_id = p_organization_id");
    expect(migration).toContain("store_id = p_store_id");
    expect(migration).toContain("for update");
    expect(migration).toContain("service_role");
    expect(migration).toContain("revoke all on function public.conversation_claim_human_internal");
  });

  it("makes same-owner reclaim idempotent and blocks takeover by another user", () => {
    expect(migration).toContain("if v_conversation.status = 'human' then");
    expect(migration).toContain("v_conversation.assigned_user_id = p_assigned_user_id");
    expect(migration).toContain("return v_conversation");
    expect(migration).toContain("conversation already assigned to another user");
    expect(migration).not.toMatch(/update\s+public\.conversations[\s\S]*assigned_user_id\s*=\s*p_assigned_user_id/i);
  });

  it("reuses the canonical INT-12 transition only for the first successful claim", () => {
    expect(migration).toContain("v_conversation.status not in ('bot', 'waiting_agent')");
    expect(migration).toContain("public.conversation_transition_internal(");
    expect(migration).toContain("'human'");
    expect(migration).toContain("p_assigned_user_id");
    expect(migration).not.toContain("insert into public.conversation_state_history");
    expect(migration).not.toContain("insert into public.audit_logs");
    expect(migration).not.toContain("insert into public.domain_events");
  });

  it("routes the panel assume action through the dedicated claim and handles conflicts without 500", () => {
    expect(actions).toContain("ConversationClaimService.assume(id)");
    expect(actions).toContain("ConversationClaimConflictError");
    expect(actions).toContain("erro=already_assigned");
    expect(actions).not.toContain('ConversationService.transition({ conversationId: id, targetState: "human"');
    expect(page).toContain("Atendimento com outro usuário");
    expect(page).toContain("Esta conversa está com outro usuário");
  });

  it("keeps RBAC/tenant context in the claim service", () => {
    expect(claimService).toContain("authorize(PERMISSIONS.CONVERSATIONS_MANAGE)");
    expect(claimService).toContain("p_organization_id: context.organizationId");
    expect(claimService).toContain("p_store_id: storeId");
    expect(claimService).toContain("p_assigned_user_id: context.userId");
  });

  it("keeps manual reply ownership revalidated by the canonical outbound RPC", () => {
    expect(conversationService).toContain('conversation.assigned_user_id !== context.userId');
    expect(conversationService).toContain('admin.rpc("conversation_create_outbound_internal"');
    expect(conversationService).toContain('p_sender_type: "agent"');
  });
});
