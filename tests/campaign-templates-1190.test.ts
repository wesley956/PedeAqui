import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppCloudProvider } from "@/server/conversations/provider";
import { campaignTemplateInputSchema, normalizeCampaignTemplate, requireApprovedCampaignTemplate } from "@/server/growth/campaign-template-model";

const raw = { id: "123", name: "promocao_v1", language: "pt_BR", status: "APPROVED", category: "MARKETING", components: [{ type: "BODY", text: "Olá {{1}}, confira as novidades da loja!" }] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("self-service campaign models [1190]", () => {
  beforeEach(() => vi.stubEnv("WHATSAPP_GRAPH_API_VERSION", "v23.0"));
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each(["{{2}}", "{{nome}}", "{1}", "{{ 1 }}"])("refuses unavailable variable %s", variable => {
    expect(campaignTemplateInputSchema.safeParse({ name: "promocao", body: `Uma promoção com ${variable}` }).success).toBe(false);
  });
  it("submits a marketing body with a sample, to the store WABA only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: "123", status: "PENDING" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new WhatsAppCloudProvider("controlled-token").createCampaignTemplate("123456789", { name: raw.name, body: raw.components[0]!.text })).resolves.toEqual({ id: "123", status: "PENDING" });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v23.0/123456789/message_templates");
    expect(JSON.parse(request.body)).toEqual({ name: raw.name, language: "pt_BR", category: "MARKETING", components: [{ ...raw.components[0]!, example: { body_text: [["Cliente"]] } }] });
    expect(request.method).toBe("POST");
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });
  it("omits variable examples for fixed text and never sends a customer message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ id: "123" }));
    vi.stubGlobal("fetch", fetchMock);
    await new WhatsAppCloudProvider("controlled-token").createCampaignTemplate("123456789", { name: "novidades", body: "Confira as novidades da loja!" });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).components).toEqual([{ type: "BODY", text: "Confira as novidades da loja!" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("lists all statuses using trusted cursor URLs even with an untrusted next URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ data: [raw], paging: { next: "https://untrusted.invalid/?access_token=bad", cursors: { after: "cursor123" } } })).mockResolvedValueOnce(response({ data: [{ ...raw, name: "rejeitado", status: "REJECTED" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const models = await new WhatsAppCloudProvider("controlled-token").listCampaignTemplates("123456789");
    expect(models.map(t => t.status)).toEqual(["APPROVED", "REJECTED"]);
    const next = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(next.hostname).toBe("graph.facebook.com");
    expect(next.searchParams.get("after")).toBe("cursor123");
    expect(next.searchParams.has("access_token")).toBe(false);
  });
  it("fails safely rather than looping or using a partial approved list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => response({ data: [raw], paging: { next: "ignored", cursors: { after: "same" } } })));
    await expect(new WhatsAppCloudProvider("controlled-token").listCampaignTemplates("123456789")).rejects.toThrow("completar");
  });
  it("does not leak the Meta error response or token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: 190, message: "sensitive provider detail" } }, 401)));
    await expect(new WhatsAppCloudProvider("controlled-token").createCampaignTemplate("123456789", { name: "modelo", body: "Mensagem de novidades" })).rejects.toMatchObject({ retryable: false, status: 401 });
    try { await new WhatsAppCloudProvider("controlled-token").listCampaignTemplates("123456789"); } catch (error) { expect(String(error)).not.toContain("sensitive provider detail"); expect(String(error)).not.toContain("controlled-token"); }
  });
  it.each(["PENDING", "REJECTED", "PAUSED", "DISABLED"])("blocks %s before enqueue/send", status => {
    expect(() => requireApprovedCampaignTemplate([normalizeCampaignTemplate({ ...raw, status })!], raw.name, raw.language, true)).toThrow();
  });
  it("rejects utility, other language, unsupported components and parameter mismatch", () => {
    for (const change of [{ category: "UTILITY" }, { language: "en_US" }, { components: [...raw.components, { type: "BUTTONS" }] }, { components: [{ type: "BODY", text: "Oferta {{2}}" }] }]) {
      expect(() => requireApprovedCampaignTemplate([normalizeCampaignTemplate({ ...raw, ...change })!], raw.name, raw.language, true)).toThrow();
    }
    expect(() => requireApprovedCampaignTemplate([normalizeCampaignTemplate(raw)!], raw.name, raw.language, false)).toThrow("variável");
    expect(requireApprovedCampaignTemplate([normalizeCampaignTemplate(raw)!], raw.name, raw.language, true).bodyText).toBe(raw.components[0]!.text);
  });
});
