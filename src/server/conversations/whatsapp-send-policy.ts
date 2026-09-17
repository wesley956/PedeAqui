export const META_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type WhatsAppWindowStatus = "open" | "closed" | "unknown";

export type WhatsAppSendBlockReason =
  | "window_closed"
  | "window_unknown"
  | "connection_unavailable"
  | "template_unavailable";

export type WhatsAppSendWindow = {
  status: WhatsAppWindowStatus;
  lastInboundAt: string | null;
  expiresAt: string | null;
  canSendFreeform: boolean;
};

export class ConversationSendPolicyError extends Error {
  constructor(
    public readonly code: WhatsAppSendBlockReason | "template_invalid",
    message: string,
  ) {
    super(message);
    this.name = "ConversationSendPolicyError";
  }
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveWhatsAppSendWindow(
  lastInboundAt: string | null | undefined,
  now = new Date(),
): WhatsAppSendWindow {
  const inbound = validDate(lastInboundAt);
  if (!inbound) {
    return {
      status: "unknown",
      lastInboundAt: null,
      expiresAt: null,
      canSendFreeform: false,
    };
  }
  const expires = new Date(inbound.getTime() + META_CUSTOMER_SERVICE_WINDOW_MS);
  const open = now.getTime() < expires.getTime();
  return {
    status: open ? "open" : "closed",
    lastInboundAt: inbound.toISOString(),
    expiresAt: expires.toISOString(),
    canSendFreeform: open,
  };
}

export function isWhatsAppConnectionReady(input: {
  enabled: boolean;
  phoneNumberId: string | null | undefined;
  connectionStatus: string | null | undefined;
}) {
  return Boolean(
    input.enabled
      && input.phoneNumberId
      && input.connectionStatus === "connected",
  );
}

export function renderWhatsAppTemplateBody(
  templateBody: string,
  parameters: string[],
) {
  return templateBody.replace(/\{\{(\d+)\}\}/g, (_match, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    return parameters[index] ?? `{{${rawIndex}}}`;
  });
}

export function templateBodyParameterCount(templateBody: string) {
  let max = 0;
  for (const match of templateBody.matchAll(/\{\{(\d+)\}\}/g)) {
    max = Math.max(max, Number(match[1] ?? 0));
  }
  return max;
}
