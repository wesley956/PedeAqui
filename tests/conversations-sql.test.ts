import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sql(name: string) {
  return readFileSync(join(process.cwd(), `supabase/sql/${name}`), "utf8").toLowerCase();
}

const core = sql("44_conversations_core.sql");
const security = sql("45_conversations_security.sql");
const customerLink = sql("46_conversations_customer_link.sql");

describe("conversation database contracts", () => {
  it("defines permissions and all exposed-domain tables with RLS", () => {
    for (const permission of ["conversations.view", "conversations.manage", "conversations.reply", "conversations.ai"]) {
      expect(core).toContain(`'${permission}'`);
    }
    for (const table of ["store_conversation_settings", "contacts", "conversations", "conversation_state_history", "messages", "automation_sessions"]) {
      expect(core).toContain(`public.${table}`);
      expect(core).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps internal mutations service-role-only", () => {
    for (const fn of [
      "conversation_transition_internal",
      "conversation_receive_message_internal",
      "conversation_create_outbound_internal",
      "conversation_mark_outbound_result_internal",
      "conversation_update_delivery_internal",
      "conversation_mark_read_internal",
      "automation_session_upsert_internal",
    ]) {
      expect(core).toMatch(new RegExp(`revoke all on function public\\.${fn}[\\s\\S]{0,260}from public, anon, authenticated`));
      expect(core).toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,260}to service_role`));
    }
  });

  it("deduplicates inbound and outbound messages", () => {
    expect(core).toContain("messages_store_provider_external_unique");
    expect(core).toContain("messages_org_client_message_unique");
    expect(core).toMatch(/on conflict \(store_id, provider, external_message_id\)[\s\s\S]*?do nothing/i);
    expect(core).toMatch(/on conflict \(organization_id, client_message_id\)[\s\s\S]*?do nothing/i);
  });

  it("locks conversation state transitions and blocks bot during human service", () => {
    expect(core).toMatch(/from public\.conversations[\s\S]{0,160}for update/);
    expect(core).toContain("human conversation requires assigned user");
    expect(core).toContain("bot cannot reply outside bot state");
    expect(core).toContain("agent must own human conversation");
  });

  it("makes message content immutable while delivery status can progress", () => {
    expect(core).toContain("protect_message_immutable_content");
    expect(core).toContain("message immutable content cannot be changed");
    expect(core).toContain("conversation_update_delivery_internal");
  });

  it("keeps settings and automation sessions explicitly private from browser roles", () => {
    expect(security).toContain("store_conversation_settings_browser_deny");
    expect(security).toContain("automation_sessions_browser_deny");
    expect(security).toContain("using (false)");
  });

  it("links inbound phone contacts to an existing CRM customer without cross-org lookup", () => {
    expect(customerLink).toContain("link_contact_customer_by_phone");
    expect(customerLink).toContain("c.organization_id = new.organization_id");
    expect(customerLink).toContain("c.phone_normalized = new.phone_normalized");
  });

  it("subscribes only operational conversation tables to Realtime", () => {
    expect(core).toContain("alter publication supabase_realtime add table public.conversations");
    expect(core).toContain("alter publication supabase_realtime add table public.messages");
  });
});
