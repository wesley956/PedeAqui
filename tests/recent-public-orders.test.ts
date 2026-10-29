import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRecentOrders, recentOrdersCookieName, recentOrdersCookieOptions, rememberRecentOrder } from "@/server/orders/recent-order-token";

const mock = vi.hoisted(() => ({ getTracking: vi.fn() }));
vi.mock("@/server/orders/public-order-service", () => ({ PublicOrderService: { getTracking: mock.getTracking } }));
import { loadRecentPublicOrders, recentOrderStatus } from "@/server/orders/recent-public-orders-service";

const access = (n: number) => ({ orderId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, accessToken: `order_${String(n).padStart(40, "a")}` });
beforeEach(() => vi.clearAllMocks());

describe("recent public orders on the same browser", () => {
  it("preserves previous orders when a new purchase starts, with a bounded newest-first history", () => {
    let cookie: string | undefined;
    for (let n = 1; n <= 7; n++) cookie = rememberRecentOrder(cookie, access(n));
    expect(readRecentOrders(cookie).map((entry) => entry.orderId)).toEqual([7, 6, 5, 4, 3].map((n) => access(n).orderId));
    cookie = rememberRecentOrder(cookie, access(5));
    expect(readRecentOrders(cookie)).toHaveLength(5);
    expect(readRecentOrders(cookie)[0]).toEqual(access(5));
  });
  it("ignores malformed, oversized and invalid credential entries", () => {
    for (const value of [null, "not-json", "x".repeat(2049), Buffer.from(JSON.stringify([{ orderId: "bad", accessToken: "short" }])).toString("base64url")]) expect(readRecentOrders(value)).toEqual([]);
    expect(() => rememberRecentOrder(null, { orderId: access(1).orderId, accessToken: "short" })).toThrow();
  });
  it("keeps credentials in an HttpOnly store-scoped cookie", () => {
    expect(recentOrdersCookieName("dona-maria")).not.toBe(recentOrdersCookieName("jack-cones"));
    expect(recentOrdersCookieOptions("dona-maria")).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/m/dona-maria", maxAge: 2592000 });
  });
  it("authorizes each order with the current store and its own access token", async () => {
    const first = { store: { slug: "dona-maria" }, order: { id: access(1).orderId, display_number: 31 } };
    mock.getTracking.mockImplementation(async (_slug, id) => id === access(1).orderId ? first : null);
    const cookie = rememberRecentOrder(rememberRecentOrder(null, access(1)), access(2));
    expect(await loadRecentPublicOrders("dona-maria", cookie)).toEqual([first]);
    expect(mock.getTracking).toHaveBeenCalledWith("dona-maria", access(1).orderId, access(1).accessToken);
    expect(mock.getTracking).toHaveBeenCalledWith("dona-maria", access(2).orderId, access(2).accessToken);
  });
  it("does not query or identify customers by phone when no browser credentials exist", async () => {
    expect(await loadRecentPublicOrders("dona-maria", null)).toEqual([]);
    expect(mock.getTracking).not.toHaveBeenCalled();
  });
  it("shows operational progress and terminal states ahead of an old payment status", () => {
    const order = { order_status: "confirmed", payment_status: "pending", production_status: "preparing", fulfillment_status: "pending" };
    expect(recentOrderStatus(order)).toBe("Em preparo");
    expect(recentOrderStatus({ ...order, order_status: "canceled" })).toBe("Cancelado");
    expect(recentOrderStatus({ ...order, fulfillment_status: "out_for_delivery" })).toBe("Saiu para entrega");
    expect(recentOrderStatus({ ...order, production_status: "pending_confirmation" })).toBe("Pagamento pendente");
  });
});
