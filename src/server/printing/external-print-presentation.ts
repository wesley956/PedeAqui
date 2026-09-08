import type { ExternalOrderPresentation } from "@/features/orders/external-order-presentation";

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeTicketText(value: string | null | undefined, max = 80) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function externalPrintIdentity(external: ExternalOrderPresentation) {
  const providerLabel = external.provider === "ifood" ? "iFood" : "99Food";
  const code = safeTicketText(external.externalDisplayId ?? external.externalOrderId);
  return {
    provider: external.provider,
    providerLabel,
    code,
  };
}

/** Persist only the operational identity needed by the print job. Raw provider
 * payloads and customer/provider metadata never cross this boundary. */
export function withExternalPrintIdentity(payload: unknown, external: ExternalOrderPresentation) {
  const root = recordValue(payload);
  const order = recordValue(root.order);
  const identity = externalPrintIdentity(external);
  return {
    ...root,
    order: {
      ...order,
      external: {
        provider: identity.provider,
        display_id: identity.code || null,
      },
    },
  };
}

/**
 * Thermal templates remain provider-neutral. The sanitized external identity is
 * added as a compact ASCII-safe header after the normal template renders.
 */
export function prependExternalPrintIdentity(rendered: string, external: ExternalOrderPresentation) {
  const identity = externalPrintIdentity(external);
  const lines = [`Origem: ${identity.providerLabel}`];
  if (identity.code) lines.push(`Codigo ${identity.providerLabel}: ${identity.code}`);
  return `${lines.join("\n")}\n${rendered}`;
}
