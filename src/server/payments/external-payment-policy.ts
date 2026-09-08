export type ExternalPaymentOwner = "pedeaqui" | "provider" | "merchant";

export type ExternalPaymentPolicy = {
  external: boolean;
  owner: ExternalPaymentOwner | null;
  provider: "ifood" | "99food" | null;
  allowsInternalMutation: boolean;
  allowsOnlinePix: boolean;
};

type ExternalPaymentRow = {
  provider?: unknown;
  payment_owner?: unknown;
} | null | undefined;

export function resolveExternalPaymentPolicy(row: ExternalPaymentRow): ExternalPaymentPolicy {
  if (!row) {
    return {
      external: false,
      owner: null,
      provider: null,
      allowsInternalMutation: true,
      allowsOnlinePix: true,
    };
  }

  const provider = row.provider === "ifood" || row.provider === "99food" ? row.provider : null;
  const owner: ExternalPaymentOwner = row.payment_owner === "provider" || row.payment_owner === "pedeaqui" || row.payment_owner === "merchant"
    ? row.payment_owner
    : "provider";

  return {
    external: true,
    owner,
    provider,
    // Provider-owned money is reconciled from provider evidence. Merchant-owned
    // collection (cash/card on delivery) and any future explicit PedeAqui-owned
    // collection may still use the internal ledger.
    allowsInternalMutation: owner !== "provider",
    // Marketplace imports never start PedeAqui's online Pix automatically.
    // Enabling that in the future requires an explicit product/contract flow.
    allowsOnlinePix: false,
  };
}

export function externalPaymentOwnerLabel(policy: ExternalPaymentPolicy) {
  if (!policy.external) return "PedeAqui";
  if (policy.owner === "provider") return policy.provider === "ifood" ? "iFood" : policy.provider === "99food" ? "99Food" : "marketplace";
  if (policy.owner === "merchant") return "restaurante";
  return "PedeAqui";
}
