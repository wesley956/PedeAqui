import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => ({ result: { data: null as null | { allow_item_notes: boolean }, error: null as Error | null } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => query.result }) }) }) }) }));
import { allowPublicItemNotes } from "@/server/menu/item-notes-policy";
describe("online menu item notes", () => {
  beforeEach(() => { query.result = { data: null, error: null }; });
  it("preserves notes for stores without a settings row", async () => { expect(await allowPublicItemNotes("store")).toBe(true); });
  it("disables notes only when explicitly configured", async () => { query.result.data = { allow_item_notes: false }; expect(await allowPublicItemNotes("store")).toBe(false); });
  it("retains notes for enabled stores", async () => { query.result.data = { allow_item_notes: true }; expect(await allowPublicItemNotes("store")).toBe(true); });
  it("does not silently permit notes when settings cannot be read", async () => { query.result.error = new Error("database unavailable"); await expect(allowPublicItemNotes("store")).rejects.toThrow("database unavailable"); });
});
