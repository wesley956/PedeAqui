import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8").replace(/\s+/g, " ");

describe("manual subscription PIX", () => {
  it("requires subscription.view and keeps invoice scoped to the active organization", () => {
    const action = read("src/features/subscription/actions.ts");
    expect(action).toContain("PERMISSIONS.SUBSCRIPTION_VIEW");
    expect(action).toContain('.eq("organization_id", access.context.organizationId)');
    expect(action).toContain('["pending", "overdue"]');
  });

  it("reuses a valid PIX and reconciles an expired one before creating another", () => {
    const action = read("src/features/subscription/actions.ts");
    expect(action).toContain("O PIX atual ainda está válido");
    expect(action).toContain("SubscriptionPixBillingService.reconcileCharge");
    expect(action).toContain('reconciliation.status === "pending"');
    expect(action).toContain("SubscriptionPixBillingService.createCharge");
  });

  it("shows the manual generation button only when an open invoice has no valid PIX", () => {
    const page = read("src/app/(app)/assinatura/page.tsx");
    const button = read("src/app/(app)/assinatura/generate-pix-button.tsx");
    expect(page).toContain("charge.invoice_id === openInvoice.id");
    expect(page).toContain("<GeneratePixButton invoiceId={openInvoice.id}");
    expect(button).toContain("Gerar PIX da mensalidade");
    expect(button).toContain("Gerar novo PIX");
    expect(button).toContain("disabled={pending}");
  });
});
