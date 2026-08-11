import { createHash, timingSafeEqual } from "node:crypto";
import { ConversationService } from "@/server/conversations/conversation-service";
import { parseWhatsAppWebhook, verifyMetaWebhookSignature, webhookPhoneNumberIds } from "@/server/conversations/whatsapp-webhook";

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
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return new Response("Payload too large", { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const events = parseWhatsAppWebhook(payload);
  if (events.length === 0) return Response.json({ ok: true });

  try {
    const phoneNumberIds = webhookPhoneNumberIds(events);
    const secrets = new Set<string>();
    for (const phoneNumberId of phoneNumberIds) {
      secrets.add(await ConversationService.resolveWebhookAppSecret(phoneNumberId));
    }
    if (secrets.size !== 1) return new Response("Ambiguous webhook app", { status: 400 });
    const appSecret = [...secrets][0];
    if (!appSecret || !verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
      return new Response("Invalid signature", { status: 401 });
    }

    for (const event of events) await ConversationService.ingestWhatsAppEvent(event);
    return Response.json({ ok: true });
  } catch {
    return new Response("Webhook processing failed", { status: 500 });
  }
}
