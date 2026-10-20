import { z } from "zod";
import { NextResponse } from "next/server";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { getRequestContext } from "@/server/observability/request-context";
import { recordFailure } from "@/server/observability/failure";
import { InfinitePayWebhookAuthError, processInfinitePayOrderWebhook } from "@/server/payments/infinitepay-webhook-service";

const MAX_WEBHOOK_BYTES = 256_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  const requestContext = await getRequestContext();
  const responseHeaders = { "x-request-id": requestContext.requestId };
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Payload too large", requestId: requestContext.requestId }, { status: 413, headers: responseHeaders });
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
      return NextResponse.json({ error: "Payload too large", requestId: requestContext.requestId }, { status: 413, headers: responseHeaders });
    }
    const { storeId } = await params;
    if (!z.uuid().safeParse(storeId).success) return NextResponse.json({ error: "Invalid store" }, { status: 400 });
    const token = new URL(request.url).searchParams.get("token");
    const result = await processInfinitePayOrderWebhook({ storeId, rawBody, token });
    scheduleOrderWhatsAppNotifications("infinitepay.webhook");
    return NextResponse.json({ ok: true, ...result, requestId: requestContext.requestId }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof InfinitePayWebhookAuthError) {
      return NextResponse.json(
        { error: "Payment webhook authentication failed", requestId: requestContext.requestId },
        { status: 401, headers: responseHeaders },
      );
    }
    const failure = recordFailure("payments.infinitepay.webhook.failed", error, { requestId: requestContext.requestId });
    return NextResponse.json(
      { error: failure.retryable ? "Payment webhook temporarily unavailable" : "Payment webhook rejected", requestId: requestContext.requestId },
      { status: failure.retryable ? 503 : 400, headers: responseHeaders },
    );
  }
}
