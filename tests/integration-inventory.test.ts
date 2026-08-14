import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const doc = read("docs/integrations/INTEGRATION_INVENTORY_308.md");

describe("external integration inventory", () => {
  it("covers every critical integration requested by [308]", () => {
    for (const subject of ["WhatsApp Cloud API", "Billing / assinatura", "Fiscal", "Impressão local / Print Agent", "Outbound webhooks", "Health check"]) {
      expect(doc).toContain(subject);
    }
  });

  it("links each contract to versioned implementation evidence", () => {
    const evidence = [
      "src/server/conversations/provider.ts",
      "src/app/api/webhooks/whatsapp/route.ts",
      "src/app/api/webhooks/billing/[providerKey]/route.ts",
      "src/server/platform/billing-webhook-service.ts",
      "src/server/fiscal/fiscal-provider.ts",
      "src/server/integrations/outbound-webhook-worker.ts",
      "src/app/api/health/route.ts",
      "src/server/printing/print-queue-service.ts",
      "print-agent/src/index.mjs",
    ];
    for (const relative of evidence) {
      expect(fs.existsSync(path.join(root, relative)), `${relative} must exist`).toBe(true);
      expect(doc).toContain(relative.replace("print-queue-service.ts", "*"));
    }
  });

  it("keeps outbound webhook SSRF and retry controls explicit", () => {
    const worker = read("src/server/integrations/outbound-webhook-worker.ts");
    expect(worker).toContain('url.protocol!=="https:"');
    expect(worker).toContain("OUTBOUND_WEBHOOK_ALLOWED_HOSTS");
    expect(worker).toContain('redirect:"manual"');
    expect(worker).toContain("AbortSignal.timeout(10_000)");
    expect(worker).toContain("retry-after");
    expect(worker).toContain("createHmac");
  });

  it("does not dump raw billing webhook errors at the HTTP boundary", () => {
    const route = read("src/app/api/webhooks/billing/[providerKey]/route.ts");
    expect(route).toContain("errorType");
    expect(route).not.toContain('console.error("billing webhook failed",error)');
    expect(route).not.toContain("rawBody,error");
  });

  it("keeps secrets server-only by configuration name", () => {
    expect(doc).not.toMatch(/NEXT_PUBLIC_(WHATSAPP|BILLING|FISCAL|PRINT|OUTBOUND)/);
    expect(doc).toContain("nenhuma dessas credenciais pode usar prefixo `NEXT_PUBLIC_`");
  });
});
