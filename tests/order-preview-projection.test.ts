import { describe, expect, it, vi } from "vitest";
import { loadOrderPreviewAction } from "@/features/orders/order-preview-action";
import { OrderService } from "@/server/orders/order-service";
vi.mock("@/server/orders/order-service", () => ({ OrderService: { get: vi.fn() } }));

describe("read-only order preview projection", () => {
  it("uses the authorized order service and excludes internal fields", async () => {
    vi.mocked(OrderService.get).mockResolvedValueOnce({ order: { id: "test", organization_id: "private", access_token: "secret", subtotal_cents: 8000, delivery_fee_cents: 260, discount_cents: 0, total_cents: 8260, fulfillment_type: "pickup", payment_method_snapshot: "cash", cash_change_for_cents: 10000 }, items: [{ id: "item", quantity: 1, product_name_snapshot: "Produto", line_total_cents: 8000, note: "Sem cebola", modifiers: [{ modifier_name_snapshot: "Queijo extra" }] }] } as unknown as Awaited<ReturnType<typeof OrderService.get>>);
    const result = await loadOrderPreviewAction("test");
    expect(OrderService.get).toHaveBeenCalledWith("test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.detail.items[0]?.modifiers).toEqual(["Queijo extra"]);
      expect(result.detail.address).toBeNull();
      expect(result.detail).not.toHaveProperty("access_token");
      expect(result.detail).not.toHaveProperty("organization_id");
    }
  });
  it("returns a safe error for denied or missing orders without leaking server details", async () => {
    vi.mocked(OrderService.get).mockRejectedValueOnce(new Error("tenant secret forbidden"));
    const result = await loadOrderPreviewAction("other-tenant");
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result).not.toHaveProperty("detail");
  });
});
