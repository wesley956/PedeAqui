import { expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ getOrder: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/orders/public-order-service", () => ({ PublicOrderService: { get: mock.getOrder } }));

import { GET } from "@/app/m/[slug]/pedido/[id]/acesso/route";

it("keeps a WhatsApp tracking link on the public origin behind a reverse proxy", async () => {
  const slug = "jack-cones";
  const id = "00000000-0000-4000-8000-000000000001";
  const token = "a".repeat(43);
  const path = `/m/${slug}/pedido/${id}`;
  mock.getOrder.mockResolvedValue({ order: { id } });

  const response = await GET(new Request(`https://0.0.0.0:3000${path}/acesso?t=${token}`), {
    params: Promise.resolve({ slug, id }),
  });

  expect(mock.getOrder).toHaveBeenCalledWith(slug, id, token);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(path);
  expect(response.headers.get("set-cookie")).toContain(`Path=${path};`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});
