import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { friendlyPaymentActionError } from "@/features/payments/payment-action-error";

const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

describe("presentation diagnostics 041-045", () => {
  it("never returns internal payment errors to the manager", () => {
    expect(friendlyPaymentActionError(new Error("payment not found in private ledger"))).toBe("Pagamento não encontrado neste pedido ou nesta unidade.");
    expect(friendlyPaymentActionError(new Error("only paid payment can be refunded"))).toContain("não está mais disponível");
    expect(friendlyPaymentActionError(new Error("sensitive database connection detail"))).not.toContain("database");
    expect(read("src/features/payments/actions.ts")).toContain("refresh(orderId)");
  });

  it("exposes manual printing and reports a missing route safely", () => {
    const actions = read("src/features/orders/actions.ts");
    const page = read("src/app/(app)/pedidos/[id]/page.tsx");
    expect(actions).toContain("PrintService.requestConfirmedOrderPrint(orderId)");
    expect(actions).toContain("No active print routes");
    expect(page).toContain('intent="print"');
    expect(page).not.toContain("{job.last_error}</div>");
  });

  it("requires webhook readiness and keeps provider details out of the operator UI", () => {
    const manual = read("src/server/platform/platform-whatsapp-manual-service.ts");
    const provider = read("src/server/conversations/provider.ts");
    const conversation = read("src/server/conversations/conversation-service.ts");
    const greeting = read("src/server/conversations/greeting-service.ts");
    expect(manual).toContain('missing.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN")');
    expect(provider).not.toContain("payload?.error?.message?.slice");
    expect(conversation).toContain("safeWhatsAppFailureMessage(error)");
    expect(greeting).toContain("safeWhatsAppFailureMessage(error)");
  });
});
