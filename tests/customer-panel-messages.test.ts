import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(relativePath: string) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }

describe("customer panel messages", () => {
  it("keeps read receipts server-only", () => {
    const migration = read("supabase/migrations/20260914071619_customer_panel_message_receipts.sql");
    expect(migration).toContain("platform_customer_message_receipts");
    expect(migration).toMatch(/unique \(message_id, user_id\)/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/revoke all on table public\.platform_customer_message_receipts from public, anon, authenticated;/i);
    expect(migration).toMatch(/grant select, insert, update, delete on table public\.platform_customer_message_receipts to service_role;/i);
  });

  it("publishes only due scheduled messages from the authenticated organization panel channel", () => {
    const service = read("src/server/platform/customer-panel-message-service.ts");
    expect(service).toContain('.eq("organization_id", organizationId)');
    expect(service).toContain('.eq("channel", "panel")');
    expect(service).toContain('.eq("status", "scheduled")');
    expect(service).toContain('.lte("scheduled_at", publishedAt)');
    expect(service).toContain('status: "sent"');
  });

  it("requires authentication and active organization membership before recording a read receipt", () => {
    const action = read("src/features/customer-messages/actions.ts");
    const service = read("src/server/platform/customer-panel-message-service.ts");
    expect(action).toContain("requireAuthenticatedUser");
    expect(service).toContain('.from("organization_members")');
    expect(service).toContain('.eq("status", "active")');
    expect(service).toContain('onConflict: "message_id,user_id"');
  });

  it("surfaces unread messages both as a banner and in the notification center", () => {
    const shell = read("src/components/layout/app-shell.tsx");
    const topbar = read("src/components/layout/operation-topbar.tsx");
    expect(shell).toContain("CustomerMessageBanner");
    expect(topbar).toContain("CustomerMessageNotifications");
  });
});
