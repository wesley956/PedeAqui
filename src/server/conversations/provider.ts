import "server-only";

export type ProviderSendTextInput = {
  phoneNumberId: string;
  recipient: string;
  body: string;
};

export type ProviderSendTemplateInput = {
  phoneNumberId: string;
  recipient: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
};

export type ProviderSendResult = {
  externalMessageId: string;
};

export type WhatsAppPhoneNumberInspection = {
  id: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
};

export interface ConversationProvider {
  sendText(input: ProviderSendTextInput): Promise<ProviderSendResult>;
  sendTemplate?(input: ProviderSendTemplateInput): Promise<ProviderSendResult>;
}

export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerCode: string | null,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
  }
}

function requireSecretReference(reference: string | null | undefined, fallbackName: string) {
  const envName = reference?.trim() || fallbackName;
  if (!/^[A-Z][A-Z0-9_]{2,100}$/.test(envName)) {
    throw new Error("Referência de segredo do WhatsApp inválida.");
  }
  const value = process.env[envName];
  if (!value) throw new Error(`Segredo ${envName} não configurado no servidor.`);
  return value;
}

export function resolveWhatsAppGraphVersion() {
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  if (!version || !/^v\d+\.\d+$/.test(version)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION não configurado.");
  }
  return version;
}

export function resolveWhatsAppAppSecret(reference?: string | null) {
  return requireSecretReference(reference, "WHATSAPP_APP_SECRET");
}

export function resolveWhatsAppAccessToken(reference?: string | null) {
  return requireSecretReference(reference, "WHATSAPP_ACCESS_TOKEN");
}

function providerError(response: Response, payload: { error?: { message?: string; code?: number; type?: string } } | null) {
  const code = payload?.error?.code === undefined ? null : String(payload.error.code);
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  const detail = payload?.error?.message?.slice(0, 240) || `HTTP ${response.status}`;
  return new WhatsAppProviderError(`WhatsApp Cloud API indisponível ou rejeitou a solicitação: ${detail}`, response.status, code, retryable);
}

const PROVIDER_TIMEOUT_MS = 8_000;

type MessageResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number; type?: string };
} | null;

export class WhatsAppCloudProvider implements ConversationProvider {
  constructor(private readonly accessToken: string) {}

  async inspectPhoneNumber(phoneNumberId: string): Promise<WhatsAppPhoneNumberInspection> {
    const version = resolveWhatsAppGraphVersion();
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}`);
    url.searchParams.set("fields", "id,display_phone_number,verified_name,quality_rating");
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => null) as {
      id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message?: string; code?: number; type?: string };
    } | null;
    if (!response.ok || !payload?.id) throw providerError(response, payload);
    if (payload.id !== phoneNumberId) throw new WhatsAppProviderError("O token retornou um Phone Number ID diferente do configurado.", 409, "phone_number_mismatch", false);
    return {
      id: payload.id,
      displayPhoneNumber: payload.display_phone_number ?? null,
      verifiedName: payload.verified_name ?? null,
      qualityRating: payload.quality_rating ?? null,
    };
  }

  private async sendMessage(phoneNumberId: string, body: Record<string, unknown>): Promise<ProviderSendResult> {
    const version = resolveWhatsAppGraphVersion();
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => null) as MessageResponse;
    const externalMessageId = payload?.messages?.[0]?.id;
    if (!response.ok || !externalMessageId) throw providerError(response, payload);
    return { externalMessageId };
  }

  async sendText(input: ProviderSendTextInput): Promise<ProviderSendResult> {
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: "whatsapp",
      to: input.recipient,
      type: "text",
      text: { body: input.body },
    });
  }

  async sendTemplate(input: ProviderSendTemplateInput): Promise<ProviderSendResult> {
    if (!/^[a-z0-9_]{1,512}$/.test(input.templateName)) throw new Error("Nome de template do WhatsApp inválido.");
    if (!/^[a-z]{2}_[A-Z]{2}$/.test(input.languageCode)) throw new Error("Idioma do template do WhatsApp inválido.");
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipient,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components: [
          {
            type: "body",
            parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
          },
        ],
      },
    });
  }
}
