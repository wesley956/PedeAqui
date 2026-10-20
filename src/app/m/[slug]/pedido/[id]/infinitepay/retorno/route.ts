import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { orderCookieName } from "@/server/orders/order-token";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { InfinitePayCheckoutService } from "@/server/payments/infinitepay-checkout-service";
import { infinitePayNotificationSchema } from "@/server/payments/providers/infinitepay-checkout-provider";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const token = (await cookies()).get(orderCookieName(slug, id))?.value;
  if (!token) return NextResponse.json({ error: "Abra o pedido no aparelho em que ele foi feito." }, { status: 401 });
  const order = await PublicOrderService.getTracking(slug, id, token);
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const parsed = infinitePayNotificationSchema.safeParse({
    order_nsu: query.get("order_nsu"), transaction_nsu: query.get("transaction_nsu"), invoice_slug: query.get("slug"),
  });
  if (parsed.success) {
    try {
      const result = await InfinitePayCheckoutService.reconcile(order.store.id, parsed.data, order.order.id);
      if (result.paid) scheduleOrderWhatsAppNotifications("infinitepay.return");
    } catch {
      // The order remains pending. The authenticated webhook can retry later.
      // Returning to the order page is never itself proof of payment.
    }
  }
  const response = NextResponse.redirect(new URL(`/m/${encodeURIComponent(slug)}/pedido/${id}`, request.url));
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");
  return response;
}
