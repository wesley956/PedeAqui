import { createHash, timingSafeEqual } from "node:crypto";
import { ConversationService } from "@/server/conversations/conversation-service";
import { ConversationGreetingService } from "@/server/conversations/greeting-service";
import { resolveWhatsAppWebhookRouting } from "@/server/conversations/webhook-routing";
import { parseWhatsAppWebhook, verifyMetaWebhookSignature, webhookPhoneNumberIds } from "@/server/conversations/whatsapp-webhook";
import { recordFailure } from "@/server/observability/failure";
import { getRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";

function constantEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "";

  if (mode !== "subscribe" || !expected || !verifyToken || !constantEqual(verifyToken, expected)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  const requestContext = await getRequestContext();
  const responseHeaders = { "x-request-id": requestContext.requestId };
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return new Response("Payload too large", { status: 413, headers: responseHeaders });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: responseHeaders });
  }

  const events = parseWhatsAppWebhook(payload);
  if (events.length === 0) return Response.json({ ok: true, requestId: requestContext.requestId }, { headers: responseHeaders });

  try {
    const routing = await resolveWhatsAppWebhookRouting(webhookPhoneNumberIds(events));
    if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), routing.appSecret)) {
      return new Response("Invalid signature", { status: 401, headers: responseHeaders });
    }

    let processed = 0;
    for (const event of events) {
      if (!routing.configuredPhoneNumberIds.has(event.phoneNumberId)) continue;
      const result = await ConversationService.ingestWhatsAppEvent(event);
      processed += 1;
      if (event.kind === "message") {
        try {
          await ConversationGreetingService.afterInbound(result, requestContext.requestId);
        } catch (error) {
          recordFailure("whatsapp.greeting.failed", error, { requestId: requestContext.requestId });
        }
      }
    }

    return Response.json(
      { ok: true, processed, ignored: events.length - processed, requestId: requestContext.requestId },
      { headers: responseHeaders },
    );
  } catch (error) {
    const failure = recordFailure("whatsapp.webhook.failed", error, { requestId: requestContext.requestId });
    return Response.json(
      { error: failure.retryable ? "Webhook temporarily unavailable" : "Webhook processing failed", requestId: requestContext.requestId },
      { status: failure.retryable ? 503 : 500, headers: responseHeaders },
    );
  }
}
