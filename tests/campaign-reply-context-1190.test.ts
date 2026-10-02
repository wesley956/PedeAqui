import { beforeEach, describe, expect, it, vi } from "vitest";
const { admin, from } = vi.hoisted(() => ({ from: vi.fn(), admin: { from: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
import { hasVerifiedCampaignReply } from "@/server/growth/campaign-reply-context";
import { classifyNonCommercialContact, isCampaignMenuFollowUp } from "@/server/conversations/whatsapp-non-commercial";
import { parseWhatsAppWebhook } from "@/server/conversations/whatsapp-webhook";
const campaign = "11111111-1111-4111-8111-111111111111";
const recipient = "22222222-2222-4222-8222-222222222222";
const input = { organizationId: "org-a", storeId: "store-a", conversationId: "conversation-a", customerId: "customer-a", metadata: { whatsapp_reply_to_message_id: "wamid.campaign" } };
function query(data: unknown) { const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }; q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.in.mockReturnValue(q); return q; }
beforeEach(() => { from.mockReset(); admin.from = from; });
describe("verified campaign replies [1190]", () => {
  it("preserves the quoted message ID from the signed webhook payload", () => {
    const events = parseWhatsAppWebhook({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "123456789" }, messages: [{ id: "wamid.inbound", from: "5511999999999", timestamp: "1700000000", type: "text", text: { body: "Mais informações" }, context: { id: "wamid.campaign" } }] } }] }] });
    const event = events[0];
    if (!event || !("metadata" in event)) throw new Error("Expected inbound message");
    expect(event.metadata.whatsapp_reply_to_message_id).toBe("wamid.campaign");
  });
  it("does no lookup without a quote or verified customer", async () => {
    expect(await hasVerifiedCampaignReply({ ...input, metadata: {} })).toBe(false);
    expect(await hasVerifiedCampaignReply({ ...input, customerId: null })).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
  it("requires the same tenant, conversation, customer and successful outbound/recipient", async () => {
    const message = query({ client_message_id: `campaign:${campaign}:recipient:${recipient}:v1` });
    const recipientQuery = query({ id: recipient });
    from.mockReturnValueOnce(message).mockReturnValueOnce(recipientQuery);
    expect(await hasVerifiedCampaignReply(input)).toBe(true);
    for (const q of [message, recipientQuery]) { expect(q.eq).toHaveBeenCalledWith("organization_id", "org-a"); expect(q.eq).toHaveBeenCalledWith("store_id", "store-a"); }
    expect(message.eq).toHaveBeenCalledWith("conversation_id", "conversation-a");
    expect(message.eq).toHaveBeenCalledWith("external_message_id", "wamid.campaign");
    expect(message.eq).toHaveBeenCalledWith("sender_type", "system");
    expect(recipientQuery.eq).toHaveBeenCalledWith("customer_id", "customer-a");
    expect(recipientQuery.eq).toHaveBeenCalledWith("campaign_id", campaign);
    expect(recipientQuery.eq).toHaveBeenCalledWith("id", recipient);
    expect(recipientQuery.eq).toHaveBeenCalledWith("provider_message_id", "wamid.campaign");
  });
  it.each([null, { client_message_id: "manual-send" }])("rejects unrelated or other-tenant outbound %s", async data => {
    from.mockReturnValue(query(data));
    expect(await hasVerifiedCampaignReply(input)).toBe(false);
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("rejects a campaign recipient from another customer/tenant", async () => {
    from.mockReturnValueOnce(query({ client_message_id: `campaign:${campaign}:recipient:${recipient}:v1` })).mockReturnValueOnce(query(null));
    expect(await hasVerifiedCampaignReply(input)).toBe(false);
  });
  it("routes only verified vague replies commercially and keeps drafts and explicit business contacts", () => {
    const body = "Olá! Posso ter mais informações sobre isso?";
    expect(classifyNonCommercialContact(body, { activeSession: false })).toBeNull();
    expect(classifyNonCommercialContact(body, { activeSession: false, campaignReply: true })).toBeNull();
    expect(isCampaignMenuFollowUp(body, { activeSession: false, campaignReply: true })).toBe(true);
    expect(isCampaignMenuFollowUp(body, { activeSession: true, campaignReply: true })).toBe(false);
    expect(classifyNonCommercialContact("quero enviar meu currículo", { activeSession: false, campaignReply: true })).toBe("job_candidate");
    expect(classifyNonCommercialContact("sou fornecedor de caixas", { activeSession: false, campaignReply: true })).toBe("supplier_contact");
    expect(isCampaignMenuFollowUp("vim pelo anúncio no Instagram, quero falar com atendente", { activeSession: false, campaignReply: true })).toBe(false);
    expect(isCampaignMenuFollowUp("quero falar com atendente", { activeSession: false, campaignReply: true })).toBe(false);
  });
});
