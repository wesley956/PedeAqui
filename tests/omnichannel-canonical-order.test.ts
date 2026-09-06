import { describe, expect, it } from "vitest";
import {
  canonicalExternalLink,
  shouldScheduleNativePix,
  type CanonicalExternalOrderLink,
} from "@/server/integrations/core/canonical-order";

describe("canonical external order model", () => {
  it("keeps sales channel and logistics owner independent", () => {
    const link: CanonicalExternalOrderLink = canonicalExternalLink({
      provider: "ifood",
      externalOrderId: "IF-1",
      channel: "ifood",
      paymentOwner: "provider",
      logisticsOwner: "99entrega",
      externalStatus: "PROVIDER_STATUS",
      externalRevision: "7",
    });

    expect(link.channel).toBe("ifood");
    expect(link.logisticsOwner).toBe("99entrega");
    expect(link.syncState).toBe("pending");
  });

  it("does not schedule native Pix for externally-owned payments", () => {
    expect(shouldScheduleNativePix({ channel: "ifood", paymentOwner: "provider" })).toBe(false);
    expect(shouldScheduleNativePix({ channel: "99food", paymentOwner: "merchant" })).toBe(false);
    expect(shouldScheduleNativePix({ channel: "pedeaqui", paymentOwner: "pedeaqui" })).toBe(true);
  });

  it("keeps external synchronization state separate from operational order states", () => {
    const link = canonicalExternalLink({
      provider: "99food",
      externalOrderId: "99-1",
      channel: "99food",
      paymentOwner: "provider",
      logisticsOwner: "99food",
      externalStatus: "UNKNOWN_NEW_PROVIDER_STATE",
      externalRevision: null,
      syncState: "attention",
    });

    expect(link.syncState).toBe("attention");
    expect(link.externalStatus).toBe("UNKNOWN_NEW_PROVIDER_STATE");
  });
});
