import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), requireModule: vi.fn(), from: vi.fn(), list: vi.fn(), create: vi.fn(), audit: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/server/access/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/modules/module-access-service", () => ({ ModuleAccessService: { require: mocks.requireModule } }));
vi.mock("@/server/audit/audit-service", () => ({ AuditService: { record: mocks.audit } }));
vi.mock("@/server/conversations/provider", () => ({ WhatsAppCloudProvider: class { listCampaignTemplates = mocks.list; createCampaignTemplate = mocks.create; }, resolveWhatsAppAccessToken: mocks.token, safeWhatsAppFailureMessage: () => "Falha segura do provedor" }));
import { CampaignTemplateService } from "@/server/growth/campaign-template-service";
const context = { organizationId: "org-a", storeId: "store-a", userId: "user-a" };
const value = { name: "promocao", body: "Confira as novidades!", language: "pt_BR" as const };
function query(data: unknown) { const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) }; q.select.mockReturnValue(q); q.eq.mockReturnValue(q); return q; }
const channel = { whatsapp_enabled: true, connection_status: "connected", whatsapp_business_account_id: "123456789", access_token_secret_ref: "STORE_REF" };
beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue(context); mocks.requireModule.mockResolvedValue(undefined); mocks.list.mockResolvedValue([]); mocks.create.mockResolvedValue({ id: "template-id", status: "PENDING" }); mocks.token.mockReturnValue("controlled-token"); mocks.audit.mockResolvedValue(undefined); });
describe("campaign model service authorization and idempotency [1190]", () => {
  it("derives the WABA from the authorized store and audits the submitted model", async () => {
    const settingsQuery = query({ growth_campaigns_enabled: true }); const channelQuery = query(channel);
    mocks.from.mockReturnValueOnce(settingsQuery).mockReturnValueOnce(channelQuery);
    expect(await CampaignTemplateService.create(value)).toEqual({ id: "template-id", status: "PENDING" });
    expect(mocks.authorize).toHaveBeenCalledWith("growth.campaigns");
    expect(mocks.requireModule).toHaveBeenCalledWith("growth", context); expect(mocks.requireModule).toHaveBeenCalledWith("conversations", context);
    for (const q of [settingsQuery, channelQuery]) { expect(q.eq).toHaveBeenCalledWith("organization_id", "org-a"); expect(q.eq).toHaveBeenCalledWith("store_id", "store-a"); }
    expect(mocks.create).toHaveBeenCalledWith("123456789", value);
    expect(mocks.audit).toHaveBeenCalledWith(context, expect.objectContaining({ action: "growth.campaign_template_submitted", entityId: "store-a", after: expect.objectContaining({ provider_template_id: "template-id", body: value.body }) }));
  });
  it("reuses a matching submission after retry without duplicating the Meta model", async () => {
    mocks.from.mockReturnValueOnce(query({ growth_campaigns_enabled: true })).mockReturnValueOnce(query(channel));
    mocks.list.mockResolvedValue([{ id: "existing", name: value.name, language: value.language, bodyText: value.body, category: "MARKETING", supported: true, status: "PENDING" }]);
    expect(await CampaignTemplateService.create(value)).toEqual({ id: "existing", status: "PENDING" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects overwriting a previously submitted model", async () => {
    mocks.from.mockReturnValueOnce(query({ growth_campaigns_enabled: true })).mockReturnValueOnce(query(channel));
    mocks.list.mockResolvedValue([{ name: value.name, language: value.language, bodyText: "Other text" }]);
    await expect(CampaignTemplateService.create(value)).rejects.toThrow("novo nome");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refuses writes when the subconfiguration is disabled", async () => {
    mocks.from.mockReturnValue(query({ growth_campaigns_enabled: false }));
    await expect(CampaignTemplateService.create(value)).rejects.toThrow("desligadas");
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not query credentials or provider when permission is denied", async () => {
    mocks.authorize.mockRejectedValue(new Error("denied"));
    await expect(CampaignTemplateService.create(value)).rejects.toThrow("denied");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("keeps a disconnected channel readable without provider access", async () => {
    mocks.from.mockReturnValue(query(null));
    expect(await CampaignTemplateService.load()).toEqual({ templates: [], error: "Conecte o WhatsApp desta unidade para consultar e criar modelos." });
    expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("keeps authorization failures distinct from provider failures on load", async () => {
    mocks.authorize.mockRejectedValue(new Error("denied"));
    await expect(CampaignTemplateService.load()).rejects.toThrow("denied");
  });
  it("explains provider outages without leaking raw details", async () => {
    mocks.from.mockReturnValue(query(channel)); mocks.list.mockRejectedValue(new Error("secret detail"));
    expect(await CampaignTemplateService.load()).toEqual({ templates: [], error: "Falha segura do provedor" });
  });
});
