import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberRecentOrder } from "@/server/orders/recent-order-token";
const mock = vi.hoisted(() => ({ cookie: undefined as string | undefined, getTracking: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mock.cookie }) }) }));
vi.mock("@/server/orders/public-order-service", () => ({ PublicOrderService: { getTracking: mock.getTracking } }));
import { GET } from "@/app/m/[slug]/pedido-atual/route";

const entry = { orderId: "00000000-0000-4000-8000-000000000001", accessToken: "a".repeat(43) };
beforeEach(() => { vi.clearAllMocks(); mock.cookie = rememberRecentOrder(null, entry); mock.getTracking.mockResolvedValue({ order: { id: entry.orderId } }); });
const open = (id: string) => GET(new Request(`https://pedeaqui.test/m/dona-maria/pedido-atual?id=${id}`), { params: Promise.resolve({ slug: "dona-maria" }) });

describe("resume a recent order without putting its secret in the URL", () => {
  it("restores the existing order cookie and redirects to the clean tracking page", async () => {
    const response = await open(entry.orderId);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://pedeaqui.test/m/dona-maria/pedido/${entry.orderId}`);
    expect(response.headers.get("location")).not.toContain(entry.accessToken);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(mock.getTracking).toHaveBeenCalledWith("dona-maria", entry.orderId, entry.accessToken);
  });
  it("does not authorize an arbitrary order ID typed into the address bar", async () => {
    const response = await open("00000000-0000-4000-8000-000000000002");
    expect(response.headers.get("location")).toContain("/meus-pedidos?erro=pedido_indisponivel");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mock.getTracking).not.toHaveBeenCalled();
  });
  it("rejects a cookie that does not prove ownership in this store", async () => {
    mock.getTracking.mockResolvedValue(null);
    const response = await open(entry.orderId);
    expect(response.headers.get("location")).toContain("/meus-pedidos");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
