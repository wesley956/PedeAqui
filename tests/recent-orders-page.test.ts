import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "browser-history" }) }) }));
vi.mock("@/server/orders/recent-public-orders-service", () => ({ loadRecentPublicOrders: mock.load, recentOrderStatus: () => "Em preparo" }));
import RecentOrdersPage from "@/app/m/[slug]/meus-pedidos/page";

describe("customer order recovery page", () => {
  it("shows the order number and tracking link without exposing access tokens", async () => {
    mock.load.mockResolvedValue([{ order: { id: "order-id", display_number: 42, total_cents: 4980 }, accessToken: "secret-order-token" }]);
    const html = renderToStaticMarkup(await RecentOrdersPage({ params: Promise.resolve({ slug: "dona-maria" }) }));
    expect(html).toContain("Pedido #42");
    expect(html).toContain("Em preparo");
    expect(html).toContain("/m/dona-maria/pedido-atual?id=order-id");
    expect(html).not.toContain("secret-order-token");
  });
  it("explains how to recover a purchase from another device without ordering again", async () => {
    mock.load.mockResolvedValue([]);
    const html = renderToStaticMarkup(await RecentOrdersPage({ params: Promise.resolve({ slug: "dona-maria" }) }));
    expect(html).toContain("Você não precisa fazer o pedido novamente");
    expect(html).toContain("outro aparelho");
  });
});
