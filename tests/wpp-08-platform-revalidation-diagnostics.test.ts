import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WPP-08 platform revalidation diagnostics", () => {
  it("refreshes Meta App webhook diagnostics only after the existing WhatsApp revalidation succeeds", () => {
    const source = readFileSync("src/app/platform/unidades/[storeId]/whatsapp/actions.ts", "utf8");
    const revalidate = source.indexOf("await PlatformWhatsAppManualService.revalidate(storeId)");
    const load = source.indexOf("await PlatformWhatsAppManualService.load(storeId)", revalidate);
    const appWebhookCheck = source.indexOf(
      "await WhatsAppCoexistenceObservability.ensureAppWebhookSubscriptionCheck(",
      load,
    );
    const redirect = source.indexOf('successRedirect(storeId, "revalidated")', appWebhookCheck);

    expect(revalidate).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(revalidate);
    expect(appWebhookCheck).toBeGreaterThan(load);
    expect(redirect).toBeGreaterThan(appWebhookCheck);
  });

  it("keeps the diagnostic server-side and reuses the read-only observability service", () => {
    const action = readFileSync("src/app/platform/unidades/[storeId]/whatsapp/actions.ts", "utf8");
    const observability = readFileSync("src/server/conversations/coexistence-observability.ts", "utf8");

    expect(action).toContain('"use server"');
    expect(action).toContain("WhatsAppCoexistenceObservability.ensureAppWebhookSubscriptionCheck");
    expect(observability).toContain('/subscriptions`');
    expect(observability).toContain('method: "GET"');
    expect(observability).not.toMatch(/method:\s*"(?:POST|DELETE)"[\s\S]{0,400}\/subscriptions/);
  });
});
