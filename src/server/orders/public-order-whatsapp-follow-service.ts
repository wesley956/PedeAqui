import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppIdentifier } from "@/server/conversations/model";
import { resolveOrderRecipient } from "@/server/conversations/order-recipient-resolver";
import { isWhatsAppConnectionReady, resolveWhatsAppSendWindow } from "@/server/conversations/whatsapp-send-policy";
import {
  buildPublicOrderWhatsAppFollowProjection,
  type PublicOrderWhatsAppFollowProjection,
} from "@/server/orders/public-order-whatsapp-follow-policy";

async function latestInboundAtForContact(input: {
  organizationId: string;
  storeId: string;
  phoneNormalized: string;
}) {
  const admin = createAdminClient();
  const contactCandidates = [input.phoneNormalized, `+${input.phoneNormalized}`];
  const { data: contacts, error: contactError } = await admin.from("contacts")
    .select("id,external_id")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .in("external_id", contactCandidates);
  if (contactError) throw contactError;

  const contactIds = (contacts ?? [])
    .filter((contact) => normalizeWhatsAppIdentifier(contact.external_id) === input.phoneNormalized)
    .map((contact) => contact.id);
  if (contactIds.length === 0) return null;

  const { data: conversations, error: conversationError } = await admin.from("conversations")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("channel", "whatsapp")
    .in("contact_id", contactIds);
  if (conversationError) throw conversationError;
  const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
  if (conversationIds.length === 0) return null;

  const { data: messages, error: messageError } = await admin.from("messages")
    .select("provider_timestamp,created_at")
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("direction", "inbound")
    .eq("sender_type", "contact")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (messageError) throw messageError;

  let latest: number | null = null;
  for (const row of messages ?? []) {
    const raw = row.provider_timestamp ?? row.created_at;
    const value = new Date(raw).getTime();
    if (Number.isNaN(value)) continue;
    latest = latest === null ? value : Math.max(latest, value);
  }
  return latest === null ? null : new Date(latest).toISOString();
}

export class PublicOrderWhatsAppFollowService {
  static async resolve(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
    displayNumber: number;
  }): Promise<PublicOrderWhatsAppFollowProjection> {
    const admin = createAdminClient();
    const [orderResult, settingsResult] = await Promise.all([
      admin.from("orders")
        .select("customer_id,customer_phone_snapshot")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .eq("id", input.orderId)
        .maybeSingle(),
      admin.from("store_conversation_settings")
        .select("whatsapp_enabled,whatsapp_phone_number_id,connection_status,display_phone_number")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .maybeSingle(),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (settingsResult.error) throw settingsResult.error;

    const settings = settingsResult.data;
    const connectionReady = isWhatsAppConnectionReady({
      enabled: Boolean(settings?.whatsapp_enabled),
      phoneNumberId: settings?.whatsapp_phone_number_id ?? null,
      connectionStatus: settings?.connection_status ?? null,
    });

    let lastInboundAt: string | null = null;
    if (orderResult.data) {
      const recipient = await resolveOrderRecipient({
        organizationId: input.organizationId,
        customerId: orderResult.data.customer_id,
        customerPhoneSnapshot: orderResult.data.customer_phone_snapshot,
      });
      if (recipient.ok) {
        lastInboundAt = await latestInboundAtForContact({
          organizationId: input.organizationId,
          storeId: input.storeId,
          phoneNormalized: recipient.phoneNormalized,
        });
      }
    }

    const window = resolveWhatsAppSendWindow(lastInboundAt);
    return buildPublicOrderWhatsAppFollowProjection({
      displayNumber: input.displayNumber,
      displayPhoneNumber: settings?.display_phone_number ?? null,
      connectionReady,
      windowStatus: window.status,
      windowExpiresAt: window.expiresAt,
    });
  }
}
