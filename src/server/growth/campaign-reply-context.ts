import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Only a quoted, successfully sent campaign for the same conversation/customer is context. */
export async function hasVerifiedCampaignReply(input: {
  organizationId: string; storeId: string; conversationId: string;
  customerId: string | null | undefined; metadata: unknown;
}) {
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : null;
  const replyId = metadata?.whatsapp_reply_to_message_id;
  if (!input.customerId || typeof replyId !== "string" || !replyId || replyId.length > 512) return false;
  const admin = createAdminClient();
  const { data: message, error } = await admin.from("messages")
    .select("client_message_id")
    .eq("organization_id", input.organizationId).eq("store_id", input.storeId)
    .eq("conversation_id", input.conversationId).eq("external_message_id", replyId)
    .eq("direction", "outbound").eq("sender_type", "system")
    .in("delivery_status", ["sent", "delivered", "read"]).maybeSingle();
  if (error) throw error;
  const uuid = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
  const identity = typeof message?.client_message_id === "string"
    ? new RegExp(`^campaign:${uuid}:recipient:${uuid}:v[0-9]+$`, "i").exec(message.client_message_id) : null;
  if (!identity) return false;
  const { data: recipient, error: recipientError } = await admin.from("campaign_recipients")
    .select("id").eq("organization_id", input.organizationId).eq("store_id", input.storeId)
    .eq("id", identity[2]).eq("campaign_id", identity[1])
    .eq("customer_id", input.customerId).eq("provider_message_id", replyId)
    .in("status", ["sent", "delivered", "read"]).maybeSingle();
  if (recipientError) throw recipientError;
  return Boolean(recipient);
}
