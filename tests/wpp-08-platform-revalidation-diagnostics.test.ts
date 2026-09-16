import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WPP-08 platform revalidation diagnostics", () => {
  it("repairs Meta App webhook subscription only after the existing WhatsApp revalidation succeeds", () => {
    const source = readFileSync("src/app/platform/unidades/[storeId]/whatsapp/actions.ts", "utf8");
    const revalidate = source.indexOf("await PlatformWhatsAppManualService.revalidate(storeId)");
    const load = source.indexOf("await PlatformWhatsAppManualService.load(storeId)", revalidate);
    const appWebhookRepair = source.indexOf(
      "await WhatsAppCoexistenceObservability.ensureAppWebhookSubscriptionRepair(",
      load,
    );
    const redirect = source.indexOf('successRedirect(storeId, "revalidated")', appWebhookRepair);

    expect(revalidate).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(revalidate);
    expect(appWebhookRepair).toBeGreaterThan(load);
    expect(redirect).toBeGreaterThan(appWebhookRepair);
  });

  it("keeps the repair server-side, explicit and restricted to the Meta App subscriptions endpoint", () => {
    const action = readFileSync("src/app/platform/unidades/[storeId]/whatsapp/actions.ts", "utf8");
    const observability = readFileSync("src/server/conversations/coexistence-observability.ts", "utf8");

    expect(action).toContain('"use server"');
    expect(action).toContain("WhatsAppCoexistenceObservability.ensureAppWebhookSubscriptionRepair");
    expect(observability).toContain('process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    expect(observability).toContain('method: "GET"');
    expect(observability).toContain('method: "POST"');
    expect(observability).toContain('object: "whatsapp_business_account"');
    expect(observability).toContain('fields: plan.fields.join(",")');
    expect(observability).not.toContain('method: "DELETE"');
  });

  it("does not move the repair into the customer webhook path or alter echo ingestion contracts", () => {
    const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    const coexistence = readFileSync("src/server/conversations/coexistence-service.ts", "utf8");

    expect(webhook).not.toContain("ensureAppWebhookSubscriptionRepair");
    expect(webhook).toContain("WhatsAppCoexistenceService.ingest(event)");
    expect(coexistence).toContain("conversation_receive_echo_internal");
  });
});
