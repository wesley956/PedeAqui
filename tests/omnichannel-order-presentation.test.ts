import { describe, expect, it } from "vitest";
import {
  externalLogisticsLabel,
  externalPaymentLabel,
  externalSyncLabel,
  orderChannelBadgeLabel,
  sanitizeExternalOrderPresentation,
} from "@/features/orders/external-order-presentation";

describe("external order presentation", () => {
  it("projects only operational metadata from the minimized snapshot", () => {
    const presentation = sanitizeExternalOrderPresentation({
      provider: "ifood",
      external_order_id: "provider-order-1",
      payment_owner: "provider",
      logistics_owner: "ifood",
      sync_status: "synced",
      last_snapshot: {
        externalDisplayId: "IF-1234",
        timing: "scheduled",
        recommendedPreparationAt: "2026-09-08T20:30:00Z",
        payments: [{ prepaid: true, method: "ONLINE", amountCents: 2990 }],
        customer: { name: "must-not-leak" },
        address: { street: "must-not-leak" },
        providerMetadata: { raw: "must-not-leak" },
      },
    });

    expect(presentation).toEqual({
      provider: "ifood",
      externalOrderId: "provider-order-1",
      externalDisplayId: "IF-1234",
      syncStatus: "synced",
      paymentOwner: "provider",
      prepaid: true,
      logisticsOwner: "ifood",
      timing: "scheduled",
      recommendedPreparationAt: "2026-09-08T20:30:00Z",
    });
    expect(JSON.stringify(presentation)).not.toContain("must-not-leak");
  });

  it("uses human labels and keeps native orders branded as PedeAqui", () => {
    const external = sanitizeExternalOrderPresentation({
      provider: "99food",
      external_order_id: "99-1",
      payment_owner: "merchant",
      logistics_owner: "99entrega",
      sync_status: "retry",
      last_snapshot: { payments: [{ prepaid: false }] },
    });

    expect(external).not.toBeNull();
    expect(orderChannelBadgeLabel("99food", external)).toBe("99Food");
    expect(orderChannelBadgeLabel("menu", null)).toBe("PedeAqui");
    expect(externalSyncLabel(external!.syncStatus)).toBe("Atenção na sincronização");
    expect(externalPaymentLabel(external!)).toBe("Pagamento no restaurante");
    expect(externalLogisticsLabel(external!)).toBe("Entrega 99Entrega");
  });

  it("fails closed for unsupported provider data", () => {
    expect(sanitizeExternalOrderPresentation({
      provider: "unknown",
      external_order_id: "x",
      payment_owner: "provider",
      logistics_owner: null,
      sync_status: "synced",
      last_snapshot: {},
    })).toBeNull();
  });
});
