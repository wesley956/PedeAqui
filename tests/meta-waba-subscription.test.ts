import { describe, expect, it, vi } from "vitest";
import {
  MetaSubscriptionCertificationError,
  certifyMetaAppSubscription,
} from "@/server/conversations/meta-waba-subscription";

describe("Meta WABA subscription certification", () => {
  it("confirms the configured PedeAqui app in subscribed_apps", async () => {
    const readSubscribedApps = vi.fn().mockResolvedValue({
      data: [
        { whatsapp_business_api_data: { id: "111111" } },
        { whatsapp_business_api_data: { id: 222222 } },
      ],
    });

    await expect(certifyMetaAppSubscription("222222", readSubscribedApps)).resolves.toEqual({
      confirmed: true,
      appId: "222222",
    });
    expect(readSubscribedApps).toHaveBeenCalledTimes(1);
  });

  it("fails explicitly when the configured app is absent from subscribed_apps", async () => {
    const readSubscribedApps = vi.fn().mockResolvedValue({
      data: [{ whatsapp_business_api_data: { id: "111111" } }],
    });

    const promise = certifyMetaAppSubscription("222222", readSubscribedApps);
    await expect(promise).rejects.toBeInstanceOf(MetaSubscriptionCertificationError);
    await expect(promise).rejects.toMatchObject({ kind: "meta_subscription_not_confirmed" });
  });

  it("distinguishes a readback/API failure from a negative certification", async () => {
    const graphFailure = new Error("graph unavailable");
    const readSubscribedApps = vi.fn().mockRejectedValue(graphFailure);

    const promise = certifyMetaAppSubscription("222222", readSubscribedApps);
    await expect(promise).rejects.toMatchObject({
      name: "MetaSubscriptionCertificationError",
      kind: "meta_subscription_certification_failed",
      cause: graphFailure,
    });
  });
});
