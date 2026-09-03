import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Keep this contract on the current main so the migration is validated with the stabilized npm resolution.
const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/sql/187_whatsapp_automation_cancel_and_custom_templates.sql"),
  "utf8",
);

describe("#434 migration 187 WhatsApp automation schema", () => {
  it("adds cancellation and custom templates with inert backwards-compatible defaults", () => {
    expect(sql).toContain("notify_order_canceled boolean not null default false");
    expect(sql).toContain("order_notification_custom_templates jsonb not null default '{}'::jsonb");
    expect(sql).toContain("jsonb_typeof(order_notification_custom_templates) = 'object'");
    expect(sql).not.toMatch(/update\s+public\.store_conversation_settings/i);
  });

  it("extends the existing queue instead of creating a second WhatsApp notification engine", () => {
    expect(sql).toContain("alter table public.order_whatsapp_notifications");
    expect(sql).toContain("'order_canceled'::text");
    expect(sql).not.toMatch(/create\s+table\s+.*whatsapp/i);
  });

  it("reacts only to the authoritative order.canceled domain event", () => {
    expect(sql).toContain("when 'order.canceled' then 'order_canceled'");
    expect(sql).toContain("create or replace function private.enqueue_order_whatsapp_notification_from_event()");
    expect(sql).not.toContain("order_transition_internal");
  });

  it("preserves the existing queue idempotency path", () => {
    expect(sql).toContain("on conflict (organization_id, order_id, notification_type) do nothing");
    expect(sql).toContain("domain_event_id");
  });
});
