import { createHash, timingSafeEqual } from "node:crypto";
import { ConversationService } from "@/server/conversations/conversation-service";
import { WhatsAppCoexistenceObservability } from "@/server/conversations/coexistence-observability";
import { WhatsAppCoexistenceService } from "@/server/conversations/coexistence-service";
import { ConversationGreetingService } from "@/server/conversations/greeting-service";
import { InboundOutcomeService } from "@/server/conversations/inbound-outcome-service";
import type { LegacyIntelligenceDecision } from "@/server/conversations/legacy-intelligence-observation";
import { WhatsAppDirectOrderOrchestrator } from "@/server/conversations/whatsapp-direct-order-orchestrator";
import { resolveWhatsAppWebhookRouting } from "@/server/conversations/webhook-routing";
import { parseWhatsAppWebhook, verifyMetaWebhookSignature, webhookPhoneNumberIds } from "@/server/conversations/whatsapp-webhook";
import { UnifiedIntelligenceRouterShadow } from "@/server/intelligence/unified-router-shadow";
import {
  IntelligenceShadowObservability,
  type IntelligenceShadowPreparation,
  type LegacyIntelligenceHandler,
} from "@/server/intelligence/shadow-observability";
import { recordFailure } from "@/server/observability/failure";
import { getRequestContext } from "@/server/observability/request-context";

export const runtime = "nodejs";
const MAX_WHATSAPP_WEBHOOK_BYTES = 3 * 1024 * 1024;

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
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WHATSAPP_WEBHOOK_BYTES) {
    return new Response("Payload too large", { status: 413, headers: responseHeaders });
  }

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

    await WhatsAppCoexistenceObservability.recordWebhookReceipt(events, requestContext.requestId);

    let processed = 0;
    let ignored = 0;
    for (const event of events) {
      if (!routing.configuredPhoneNumberIds.has(event.phoneNumberId)) {
        ignored += 1;
        continue;
      }

      if (event.kind === "echo" || event.kind === "sync") {
        const result = await WhatsAppCoexistenceService.ingest(event, requestContext.requestId);
        if (result && typeof result === "object" && "ignored" in result && result.ignored) ignored += 1;
        else processed += 1;
        continue;
      }

      const result = await ConversationService.ingestWhatsAppEvent(event);
      processed += 1;
      if (event.kind === "message") {
        let shadowPreparation: IntelligenceShadowPreparation | null = null;
        try {
          shadowPreparation = await UnifiedIntelligenceRouterShadow.afterInbound(result, requestContext.requestId);
        } catch (error) {
          recordFailure("whatsapp.intelligence_shadow.failed", error, { requestId: requestContext.requestId });
        }

        const legacyStartedAt = performance.now();
        let legacyDecision: LegacyIntelligenceDecision | null = null;
        const observeLegacy = (decision: LegacyIntelligenceDecision) => { legacyDecision = decision; };
        let orderHandled = false;
        try {
          orderHandled = await WhatsAppDirectOrderOrchestrator.afterInbound(result, requestContext.requestId, observeLegacy);
        } catch (error) {
          recordFailure("whatsapp.order_automation.failed", error, { requestId: requestContext.requestId });
        }

        if (!orderHandled) {
          try {
            await ConversationGreetingService.afterInbound(result, requestContext.requestId, observeLegacy);
          } catch (error) {
            recordFailure("whatsapp.greeting.failed", error, { requestId: requestContext.requestId });
          }
        }

        try {
          const legacyOutcome = await InboundOutcomeService.finalize(result);
          if (shadowPreparation) {
            let legacyHandler: LegacyIntelligenceHandler = orderHandled ? "whatsapp_order" : "greeting";
            if (shadowPreparation.duplicateSideEffectPrevented) legacyHandler = "none";
            if (legacyOutcome === "human" || legacyOutcome === "closed") legacyHandler = "none";
            if (legacyOutcome === "waiting_agent" && shadowPreparation.decision?.handoffReason === "human_lock") {
              legacyHandler = "none";
            }
            await IntelligenceShadowObservability.record(shadowPreparation, {
              legacyHandler,
              legacyDecision,
              legacyOutcome,
              legacyDurationMs: Math.max(0, performance.now() - legacyStartedAt),
            });
          }
        } catch (error) {
          recordFailure("whatsapp.inbound_outcome.failed", error, {
            requestId: requestContext.requestId,
            conversationId: result?.conversation_id ?? null,
            messageId: result?.message_id ?? null,
          });
        }
      }
    }

    return Response.json(
      { ok: true, processed, ignored, requestId: requestContext.requestId },
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
