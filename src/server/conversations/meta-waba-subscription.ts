export type MetaSubscriptionCertificationErrorKind =
  | "meta_subscription_not_confirmed"
  | "meta_subscription_certification_failed";

export type MetaSubscribedAppsResponse = {
  data?: Array<{
    whatsapp_business_api_data?: {
      id?: string | number | null;
    } | null;
  }>;
};

export class MetaSubscriptionCertificationError extends Error {
  constructor(
    public readonly kind: MetaSubscriptionCertificationErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MetaSubscriptionCertificationError";
  }
}

export async function certifyMetaAppSubscription(
  appId: string,
  readSubscribedApps: () => Promise<MetaSubscribedAppsResponse>,
) {
  let response: MetaSubscribedAppsResponse;
  try {
    response = await readSubscribedApps();
  } catch (cause) {
    throw new MetaSubscriptionCertificationError(
      "meta_subscription_certification_failed",
      "A Meta aceitou a solicitação de assinatura, mas não foi possível certificar a subscription da WABA.",
      { cause },
    );
  }

  const confirmed = (response.data ?? []).some(
    (entry) => String(entry.whatsapp_business_api_data?.id ?? "") === appId,
  );

  if (!confirmed) {
    throw new MetaSubscriptionCertificationError(
      "meta_subscription_not_confirmed",
      "A Meta aceitou a solicitação de assinatura, mas o app configurado não aparece como inscrito na WABA.",
    );
  }

  return { confirmed: true as const, appId };
}
