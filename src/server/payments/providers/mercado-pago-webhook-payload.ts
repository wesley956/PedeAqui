type JsonRecord = Record<string, unknown>;

export type MercadoPagoWebhookMetadata = {
  eventId: string | null;
  type: string | null;
  action: string | null;
  dataId: string | null;
};

const emptyMetadata = (): MercadoPagoWebhookMetadata => ({
  eventId: null,
  type: null,
  action: null,
  dataId: null,
});

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function asId(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function parseMercadoPagoWebhookMetadata(rawBody: string): MercadoPagoWebhookMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return emptyMetadata();
  }

  const body = asRecord(parsed);
  if (!body) return emptyMetadata();
  const data = asRecord(body.data);

  return {
    eventId: asId(body.id),
    type: asString(body.type),
    action: asString(body.action),
    dataId: data ? asId(data.id) : null,
  };
}
