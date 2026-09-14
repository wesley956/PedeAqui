import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerPanelMessage = {
  id: string;
  title: string;
  body: string;
  kind: string;
  sentAt: string;
  readAt: string | null;
};

export type CustomerPanelMessageState = {
  messages: readonly CustomerPanelMessage[];
  unreadCount: number;
};

export class CustomerPanelMessageService {
  static async load(organizationId: string, userId: string): Promise<CustomerPanelMessageState> {
    const admin = createAdminClient();
    const publishedAt = new Date().toISOString();

    const publish = await admin
      .from("platform_customer_messages")
      .update({ status: "sent", sent_at: publishedAt, last_error: null, updated_at: publishedAt })
      .eq("organization_id", organizationId)
      .eq("channel", "panel")
      .eq("status", "scheduled")
      .lte("scheduled_at", publishedAt);
    if (publish.error) throw publish.error;

    const messages = await admin
      .from("platform_customer_messages")
      .select("id,title,body,kind,sent_at,created_at")
      .eq("organization_id", organizationId)
      .eq("channel", "panel")
      .eq("status", "sent")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(20);
    if (messages.error) throw messages.error;

    const rows = messages.data ?? [];
    if (rows.length === 0) return { messages: [], unreadCount: 0 };

    const receipts = await admin
      .from("platform_customer_message_receipts")
      .select("message_id,read_at")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .in("message_id", rows.map((message) => message.id));
    if (receipts.error) throw receipts.error;

    const readAtByMessage = new Map((receipts.data ?? []).map((receipt) => [receipt.message_id, receipt.read_at]));
    const resolved = rows.map((message) => ({
      id: message.id,
      title: message.title,
      body: message.body,
      kind: message.kind,
      sentAt: message.sent_at ?? message.created_at,
      readAt: readAtByMessage.get(message.id) ?? null,
    }));

    return {
      messages: resolved,
      unreadCount: resolved.filter((message) => !message.readAt).length,
    };
  }

  static async markRead(messageId: string, userId: string) {
    const admin = createAdminClient();
    const message = await admin
      .from("platform_customer_messages")
      .select("id,organization_id,channel,status")
      .eq("id", messageId)
      .maybeSingle();
    if (message.error) throw message.error;
    if (!message.data || message.data.channel !== "panel" || message.data.status !== "sent") {
      throw new Error("Mensagem do painel não encontrada ou ainda não publicada.");
    }

    const membership = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", message.data.organization_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new Error("Usuário não pertence ao cliente desta mensagem.");

    const readAt = new Date().toISOString();
    const receipt = await admin
      .from("platform_customer_message_receipts")
      .upsert({
        message_id: message.data.id,
        organization_id: message.data.organization_id,
        user_id: userId,
        read_at: readAt,
        updated_at: readAt,
      }, { onConflict: "message_id,user_id" });
    if (receipt.error) throw receipt.error;
  }
}
