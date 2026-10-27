import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), recover: vi.fn(), capture: vi.fn(), recognition: vi.fn(),
  setCookie: vi.fn(), notify: vi.fn(), pix: vi.fn(), warn: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-cart-token" }), set: mocks.setCookie }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/orders/order-service", () => ({ OrderService: { createFromCheckout: mocks.create, recoverFromCheckout: mocks.recover } }));
vi.mock("@/server/conversations/order-notification-context-service", () => ({ OrderNotificationContextService: { capture: mocks.capture } }));
vi.mock("@/server/conversations/order-notification-dispatch", () => ({ scheduleOrderWhatsAppNotifications: mocks.notify }));
vi.mock("@/server/payments/order-pix-dispatch", () => ({ scheduleOrderPixCharge: mocks.pix }));
vi.mock("@/server/customers/recognition-service", () => ({ CustomerRecognitionService: { issueFromOrder: mocks.recognition } }));
vi.mock("@/server/observability/logger", () => ({ logger: { warn: mocks.warn } }));
import { createOrderFromCheckoutAction, recoverCheckoutOrderAction } from "@/features/orders/actions";

const result = { order_id: "76000000-0000-4000-8000-000000000004", display_number: 203, accessToken: "private-tracking-token" };
function form(slug = "loja-teste") { const value = new FormData(); value.set("storeSlug", slug); return value; }

describe("successful order response is independent of notification transport (#1291)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue(result); mocks.recover.mockResolvedValue(result);
    mocks.capture.mockResolvedValue(true); mocks.recognition.mockResolvedValue(null);
  });
  it("sets tracking access and redirects after notification context transport throws", async () => {
    mocks.capture.mockRejectedValue(new Error("sensitive transport details"));
    await expect(createOrderFromCheckoutAction(form())).rejects.toThrow(`redirect:/m/loja-teste/pedido/${result.order_id}`);
    expect(mocks.setCookie).toHaveBeenCalledWith(expect.stringContaining(result.order_id), result.accessToken, expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
    expect(mocks.warn).toHaveBeenCalledWith("checkout_notification_context_failed", { orderId: result.order_id, errorType: "Error" });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("sensitive transport details");
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });
  it("recovers an existing order using the opaque cart credential without creating another", async () => {
    await expect(recoverCheckoutOrderAction(form())).rejects.toThrow(`redirect:/m/loja-teste/pedido/${result.order_id}`);
    expect(mocks.recover).toHaveBeenCalledWith("loja-teste", "opaque-cart-token");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not create or issue tracking access when no order exists", async () => {
    mocks.recover.mockResolvedValue(null);
    await expect(recoverCheckoutOrderAction(form())).resolves.toBeUndefined();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("rejects an invalid slug before any recovery lookup", async () => {
    await expect(recoverCheckoutOrderAction(form("../outra-loja"))).rejects.toThrow("redirect:/");
    expect(mocks.recover).not.toHaveBeenCalled();
  });
});
