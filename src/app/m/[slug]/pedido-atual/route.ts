import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { orderCookieName } from "@/server/orders/order-token";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { readRecentOrders, recentOrdersCookieName } from "@/server/orders/recent-order-token";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const requestedId = new URL(request.url).searchParams.get("id");
  const entries = readRecentOrders((await cookies()).get(recentOrdersCookieName(slug))?.value);
  const entry = requestedId ? entries.find((item) => item.orderId === requestedId) : entries[0];
  const tracking = entry ? await PublicOrderService.getTracking(slug, entry.orderId, entry.accessToken) : null;
  const response = NextResponse.redirect(new URL(tracking && entry ? `/m/${slug}/pedido/${entry.orderId}` : `/m/${slug}/meus-pedidos?erro=pedido_indisponivel`, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (tracking && entry) response.cookies.set(orderCookieName(slug, entry.orderId), entry.accessToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/m/${slug}/pedido/${entry.orderId}`, maxAge: 30 * 24 * 60 * 60 });
  return response;
}
