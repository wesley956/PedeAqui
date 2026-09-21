import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ids = {
  organization: "76000000-0000-4000-8000-000000000001",
  store: "76000000-0000-4000-8000-000000000002",
  cart: "76000000-0000-4000-8000-000000000003",
  order: "76000000-0000-4000-8000-000000000004",
};

const state = vi.hoisted(() => ({ committed: false, loseFirstResponse: false }));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), review: vi.fn() }));

function query(table: string) {
  const filters: Array<[string, unknown]> = [];
  const builder = {
    select: () => builder,
    ilike: (column: string, value: unknown) => { filters.push([column, value]); return builder; },
    eq: (column: string, value: unknown) => { filters.push([column, value]); return builder; },
    maybeSingle: async () => {
      if (table === "stores") return { data: { id: ids.store, organization_id: ids.organization }, error: null };
      if (table === "carts") return { data: { id: ids.cart }, error: null };
      if (table === "orders") return { data: state.committed ? { id: ids.order, display_number: 906 } : null, error: null };
      return { data: null, error: null };
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query, rpc: mocks.rpc }),
}));

vi.mock("@/server/checkout/checkout-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/checkout/checkout-service")>();
  return { ...actual, CheckoutService: { review: mocks.review } };
});

import { OrderService } from "@/server/orders/order-service";

describe("FLOW-10 D06/D07 checkout refresh and unstable network", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.committed = false;
    state.loseFirstResponse = false;
    mocks.review.mockResolvedValue({ store: { id: ids.store }, review: { ready: true, blockers: [] } });
    mocks.rpc.mockImplementation(async () => {
      state.committed = true;
      if (state.loseFirstResponse) throw new Error("simulated response loss after commit");
      return { data: { order_id: ids.order, display_number: 906, created: true }, error: null };
    });
  });

  it("D06 returns the same order after a checkout refresh", async () => {
    const first = await OrderService.createFromCheckout("flow10-public-store", "stable-cart-token");
    const refreshed = await OrderService.createFromCheckout("flow10-public-store", "stable-cart-token");

    expect(first).toMatchObject({ order_id: ids.order, display_number: 906, created: true });
    expect(refreshed).toMatchObject({ order_id: ids.order, display_number: 906, created: false });
    expect(first.accessToken).toBe(refreshed.accessToken);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.review).toHaveBeenCalledTimes(1);
  });

  it("D07 recovers the committed order when the first network response is lost", async () => {
    state.loseFirstResponse = true;
    await expect(OrderService.createFromCheckout("flow10-public-store", "unstable-cart-token"))
      .rejects.toThrow("simulated response loss after commit");

    const retried = await OrderService.createFromCheckout("flow10-public-store", "unstable-cart-token");

    expect(retried).toMatchObject({ order_id: ids.order, display_number: 906, created: false });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.review).toHaveBeenCalledTimes(1);
  });
});
