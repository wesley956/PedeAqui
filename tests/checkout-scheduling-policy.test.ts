import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ allowed: false, writes: [] as Record<string, unknown>[] }));
vi.mock("@/server/cart/cart-service", () => ({ CartService: { getCart: async () => ({ store: { id: "store", organization_id: "org", slug: "test", timezone: "America/Sao_Paulo" }, cart: { id: "cart", items: [{}] }, changes: [] }) } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const chain = { select: () => chain, eq: () => chain, update: (patch: Record<string, unknown>) => { state.writes.push(patch); return chain; }, maybeSingle: async () => ({ data: { id: "session", allow_scheduling: state.allowed }, error: null }) };
  return chain;
} }) }));
import { CheckoutService } from "@/server/checkout/checkout-service";
beforeEach(() => { state.allowed = false; state.writes = []; });
describe("store checkout scheduling policy", () => {
  it("rejects a scheduled request for a disabled store without writing the session", async () => {
    await expect(CheckoutService.saveSchedule("test", "token", { mode: "scheduled", localDateTime: "2030-01-01T19:00" })).rejects.toMatchObject({ code: "scheduling_disabled" });
    expect(state.writes).toEqual([]);
  });
  it("allows immediate checkout and clears an old schedule while scheduling is disabled", async () => {
    await CheckoutService.saveSchedule("test", "token", { mode: "asap" });
    expect(state.writes[0]).toMatchObject({ scheduled_for: null, reviewed_at: null });
  });
  it("retains valid scheduling for enabled stores", async () => {
    state.allowed = true;
    const local = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    await CheckoutService.saveSchedule("test", "token", { mode: "scheduled", localDateTime: local });
    expect(state.writes[0]?.scheduled_for).toEqual(expect.any(String));
  });
});
