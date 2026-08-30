import { NextResponse } from "next/server";
import { validateMercadoPagoWebhookSignature } from "@/server/payments/providers/mercado-pago-signature";
import { SubscriptionPixBillingService } from "@/server/billing/subscription-pix-billing-service";

const RESOURCE_ID = /^[A-Za-z0-9_-]{1,120}$/;

export async function POST(request: Request) {
  let secret: string;
  try {
    secret = await SubscriptionPixBillingService.webhookSecret();
  } catch {
    return NextResponse.json({ error: "Subscription billing webhook is not configured" }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const url = new URL(request.url);
  let dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (!dataId) {
    try {
      const parsed = JSON.parse(rawBody) as { data?: { id?: unknown } };
      if (typeof parsed.data?.id === "string" || typeof parsed.data?.id === "number") dataId = String(parsed.data.id);
    } catch {
      dataId = null;
    }
  }

  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");
  if (!dataId || !RESOURCE_ID.test(dataId) || !xSignature || !xRequestId) {
    return NextResponse.json({ error: "Invalid Mercado Pago webhook envelope" }, { status: 400 });
  }

  const verified = validateMercadoPagoWebhookSignature({ xSignature, xRequestId, dataId, secret });
  if (!verified) return NextResponse.json({ error: "Invalid Mercado Pago webhook signature" }, { status: 401 });

  try {
    const result = await SubscriptionPixBillingService.reconcileByProviderResource(dataId);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "Subscription PIX reconciliation failed" }, { status: 503 });
  }
}
