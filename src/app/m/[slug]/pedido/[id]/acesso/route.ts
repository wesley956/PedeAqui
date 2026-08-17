import { NextResponse } from "next/server";
import { orderCookieName } from "@/server/orders/order-token";
import { PublicOrderService } from "@/server/orders/public-order-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const token = new URL(request.url).searchParams.get("t")?.trim();
  if (!token || token.length < 32 || token.length > 128) {
    return new NextResponse("Pedido não encontrado.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  const order = await PublicOrderService.get(slug, id, token);
  if (!order) {
    return new NextResponse("Pedido não encontrado.", {
      status: 404,
      headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  }

  const cleanUrl = new URL(`/m/${encodeURIComponent(slug)}/pedido/${encodeURIComponent(id)}`, request.url);
  const response = NextResponse.redirect(cleanUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(orderCookieName(slug, id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/m/${slug}/pedido/${id}`,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
