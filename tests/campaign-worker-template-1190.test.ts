import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), list: vi.fn(), send: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/server/conversations/provider", async original => ({ ...await original<typeof import("@/server/conversations/provider")>(), WhatsAppCloudProvider: class { listCampaignTemplates = mocks.list; sendTemplate = mocks.send; }, resolveWhatsAppAccessToken: () => "controlled-token" }));
vi.mock("@/server/modules/store-module-state-service", () => ({ StoreModuleStateService: { isEnabled: mocks.enabled } }));
vi.mock("@/server/observability/failure", () => ({ recordFailure: vi.fn() }));
vi.mock("@/server/growth/growth-observability", () => ({ recordGrowthOperationalEvent: vi.fn() }));
import { runCampaignWorker } from "@/server/growth/campaign-worker";
const job = { id: "recipient", organization_id: "org", store_id: "store", campaign_id: "campaign", occurrence_id: null, customer_id: "customer", phone_snapshot: "5511999999999", attempts: 1 };
const body = "Olá {{1}}, confira as novidades!";
let alreadySent = false;
let consent = "consented";
beforeEach(() => {
  vi.clearAllMocks(); alreadySent = false; consent = "consented";
  mocks.enabled.mockResolvedValue(true);
  mocks.list.mockResolvedValue([{ id: "model", name: "novidades", language: "pt_BR", status: "APPROVED", category: "MARKETING", bodyText: body, usesCustomerName: true, supported: true }]);
  mocks.send.mockResolvedValue({ externalMessageId: "wamid.accepted" });
  mocks.from.mockImplementation((table: string) => {
    const rows: Record<string, unknown> = {
      campaigns: { id: "campaign", status: "running", template_name: "novidades", template_language: "pt_BR", template_data: { body_parameters: ["customer_name"] }, content: body, content_version: 1 },
      customer_marketing_preferences: { status: consent }, customers: { name: "Cliente", phone_normalized: job.phone_snapshot },
      store_operational_settings: { growth_campaigns_enabled: true }, store_conversation_settings: { whatsapp_enabled: true, connection_status: "connected", whatsapp_phone_number_id: "123456789", whatsapp_business_account_id: "987654321", access_token_secret_ref: "STORE_REF" },
    };
    const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: rows[table], error: null }) };
    q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.is.mockReturnValue(q); return q;
  });
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "campaign_claim_internal" ? [job] : name === "campaign_suppression_internal" ? { suppressed: false } : name === "conversation_resolve_outbound_internal" ? { conversation_id: "conversation", external_id: job.phone_snapshot } : name === "conversation_create_outbound_internal" ? { id: "message", delivery_status: alreadySent ? "sent" : "pending", external_message_id: alreadySent ? "wamid.existing" : null } : {} }));
});
describe("campaign worker model revalidation [1190]", () => {
  it("checks its own WABA and sends exactly the approved body parameters", async () => {
    expect(await runCampaignWorker({ workerId: "worker" })).toMatchObject({ sent: 1 });
    expect(mocks.list).toHaveBeenCalledWith("987654321", "novidades");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ templateName: "novidades", languageCode: "pt_BR", bodyParameters: ["Cliente"] }));
    expect(mocks.rpc).toHaveBeenCalledWith("conversation_create_outbound_internal", expect.objectContaining({ p_body: "Olá Cliente, confira as novidades!", p_client_message_id: "campaign:campaign:recipient:recipient:v1" }));
  });
  it.each(["PAUSED", "REJECTED", "PENDING"])("never sends a model that became %s", async status => {
    mocks.list.mockResolvedValue([{ name: "novidades", language: "pt_BR", category: "MARKETING", status, supported: true, usesCustomerName: true, bodyText: body }]);
    expect(await runCampaignWorker({ workerId: "worker" })).toMatchObject({ failed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("campaign_finish_internal", expect.objectContaining({ p_status: "failed_permanent", p_error_code: "provider_template_unavailable" }));
  });
  it("blocks a changed approved body rather than sending a different offer", async () => {
    mocks.list.mockResolvedValue([{ name: "novidades", language: "pt_BR", category: "MARKETING", status: "APPROVED", supported: true, usesCustomerName: true, bodyText: "Oferta alterada {{1}}" }]);
    await runCampaignWorker({ workerId: "worker" }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not resubmit an already accepted outbound message", async () => {
    alreadySent = true;
    expect(await runCampaignWorker({ workerId: "worker" })).toMatchObject({ sent: 1 });
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("preserves opt-out protection before model lookup or send", async () => {
    consent = "opted_out";
    expect(await runCampaignWorker({ workerId: "worker" })).toMatchObject({ skipped: 1 });
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
});
