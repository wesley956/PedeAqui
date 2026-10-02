import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendOfficialBillingTemplate, verifyOfficialBillingNumber } from "@/server/billing/subscription-whatsapp-transport";
const input = { phoneNumberId: "123456789", recipient: "5519999999999", templateName: "billing_due", languageCode: "pt_BR", bodyParameters: ["R$ 79,90", "02/10/2026"] };
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); vi.stubEnv("WHATSAPP_GRAPH_API_VERSION", "v25.0"); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("billing transport acceptance boundary", () => {
  it("persists the exact message ID from accepted response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.accepted" }] }), { status: 200 }));
    expect(await sendOfficialBillingTemplate(input, "dedicated-token")).toEqual({ state: "sent", externalMessageId: "wamid.accepted", code: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer dedicated-token");
  });
  it.each([400, 401, 403, 404, 422, 429])("allows manual review of explicit %i rejection", async status => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { code: 131000, message: "private detail" } }), { status }));
    const outcome = await sendOfficialBillingTemplate(input, "token");
    expect(outcome.state).toBe("rejected"); expect(JSON.stringify(outcome)).not.toContain("private detail");
  });
  it.each([200, 408, 500, 502, 503])("quarantines uncertain %i outcome without retry", async status => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));
    expect((await sendOfficialBillingTemplate(input, "token")).state).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not retry timeout or network failure", async () => {
    fetchMock.mockRejectedValue(new Error("private token or payload"));
    expect(await sendOfficialBillingTemplate(input, "token")).toEqual({ state: "unknown", externalMessageId: null, code: "network_outcome_unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not infer ownership from a WABA containing another number", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "other-number" }] })));
    expect(await verifyOfficialBillingNumber(input.phoneNumberId, "987654321", "token")).toBe(false);
  });
});
