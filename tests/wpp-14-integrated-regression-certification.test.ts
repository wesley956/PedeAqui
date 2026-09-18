import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildWhatsAppIntelligenceMatrix,
  summarizeWhatsAppIntelligenceMatrix,
} from "@/server/conversations/whatsapp-intelligence-lab";

const requiredSuites = {
  inbox: [
    "tests/wpp-03-conversations-inbox-ui.test.ts",
    "tests/wpp-04-inbox-pagination-realtime.test.ts",
    "tests/wpp-05-inbox-customer-order-context.test.ts",
    "tests/conversations.test.ts",
    "tests/int-12-inbox-handoff-coexistence.test.ts",
    "tests/wpp-07-handoff-claim-hardening.test.ts",
    "tests/wpp-08-platform-revalidation-diagnostics.test.ts",
    "tests/wpp-09-coexistence-history-state-sync.test.ts",
    "tests/wpp-10-conversation-media.test.ts",
    "tests/wpp-11-meta-window.test.ts",
    "tests/wpp-12-inbox-rbac-lgpd.test.ts",
    "tests/wpp-13-whatsapp-operational-health.test.ts",
  ],
  orderCheckout: [
    "tests/whatsapp-direct-orders.test.ts",
    "tests/whatsapp-order-context.test.ts",
    "tests/whatsapp-order-corrections.test.ts",
    "tests/whatsapp-assorted-composition.test.ts",
    "tests/order-state-machines.test.ts",
    "tests/order-workflow-customization-807.test.ts",
    "tests/checkout-order-readiness-031-035.test.ts",
    "tests/order-flow-readiness-036-040.test.ts",
    "tests/whatsapp-payment-parity-int08.test.ts",
    "tests/order-pix-security-contract.test.ts",
    "tests/whatsapp-order-tracking-input.test.ts",
    "tests/public-order-timeline.test.ts",
    "tests/operational-order-day.test.ts",
  ],
  printing: [
    "tests/print-agent-token.test.ts",
    "tests/printing-simple-setup.test.ts",
    "tests/printing-templates.test.ts",
    "tests/omnichannel-kitchen-print.test.ts",
  ],
  intelligence: [
    "tests/whatsapp-intelligence-matrix.test.ts",
    "tests/unified-intelligence-router.test.ts",
    "tests/intelligence-authority.test.ts",
    "tests/intelligence-capability.test.ts",
    "tests/intelligence-catalog-adapter.test.ts",
    "tests/intelligence-payment-adapter.test.ts",
    "tests/intelligence-delivery-adapter.test.ts",
    "tests/intelligence-order-workflow-adapter.test.ts",
    "tests/int-09-growth-whatsapp-channel.test.ts",
  ],
} as const;

describe("WPP-14 integrated release certification", () => {
  it("keeps every mandatory protected suite in the repository", () => {
    for (const [area, files] of Object.entries(requiredSuites)) {
      for (const file of files) {
        expect(existsSync(file), `${area}: ${file}`).toBe(true);
      }
    }
  });

  it("preserves the 720-scenario WhatsApp Intelligence Lab baseline", () => {
    const matrix = buildWhatsAppIntelligenceMatrix();
    const summary = summarizeWhatsAppIntelligenceMatrix();

    expect(matrix).toHaveLength(720);
    expect(new Set(matrix.map((scenario) => scenario.id)).size).toBe(720);
    expect(Object.keys(summary.byFamily)).toHaveLength(15);
    expect(summary.critical).toBeGreaterThanOrEqual(100);
  });

  it("keeps INT-13 cross-domain certification evidence versioned", () => {
    const report = readFileSync("docs/intelligence/INT13_CROSS_DOMAIN_CERTIFICATION_REPORT.md", "utf8");
    expect(report).toContain("720 deterministic scenarios preserved");
    expect(report).toContain("critical mismatches: 0");
    expect(report).toContain("cross-tenant violations: 0");
    expect(report).toContain("certification gate: `GO`");
  });

  it("keeps CI authoritative over the full suite, public contracts, E2E, Print Agent and build", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    for (const gate of [
      "run: npm test",
      "run: npm run test:public-ux",
      "npm run test:e2e",
      "Validate Print Agent",
      "run: npm run build",
      "Production infrastructure preflight",
      "Compare production migration history",
    ]) {
      expect(workflow).toContain(gate);
    }
    expect(workflow).toContain("for attempt in 1 2 3");
  });

  it("versions the WPP-14 stop conditions and keeps real media as a separate pilot gate", () => {
    const manifest = readFileSync("docs/homologation/WPP14_INTEGRATED_REGRESSION_MATRIX.md", "utf8");
    for (const stop of [
      "cross-tenant leak",
      "mismatch de preço, pagamento, status, authority ou confirmação",
      "pedido duplicado",
      "bot responder enquanto a conversa está em humano",
      "impressão/KDS quebrada",
      "Gate físico separado — WPP-10",
      "#1110 continua aberta",
      "não transforma essa ausência de evidência em GO para WPP-15",
    ]) {
      expect(manifest).toContain(stop);
    }
  });

  it("does not introduce database or rollout activation in the certification lot", () => {
    const migrations = readdirSync("supabase/migrations");
    expect(migrations.some((name) => name.toLowerCase().includes("wpp14"))).toBe(false);

    const manifest = readFileSync("docs/homologation/WPP14_INTEGRATED_REGRESSION_MATRIX.md", "utf8");
    expect(manifest).toContain("WPP-14 não ativa cliente");
    expect(manifest).toContain("não altera subscriptions Meta");
    expect(manifest).toContain("não ativa history/state sync");
  });
});
