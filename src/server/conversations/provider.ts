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

export type ProviderTemplateSummary = {
  name: string;
  language: string;
  status: string;
  category: string | null;
  bodyText: string;
  bodyParameterCount: number;
  supported: boolean;
};

export type ProviderSendReplyButtonInput = ProviderSendTextInput & {
  buttonId: string;
  buttonTitle: string;
};

export type ProviderSendMediaInput = {
  phoneNumberId: string;
  recipient: string;
  mediaId: string;
  mediaType: "image" | "audio" | "video" | "document";
  caption?: string | null;
  filename?: string | null;
};

export type ProviderMediaUploadInput = {
  phoneNumberId: string;
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
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
  sendReplyButton?(input: ProviderSendReplyButtonInput): Promise<ProviderSendResult>;
  listTemplates?(businessAccountId: string): Promise<ProviderTemplateSummary[]>;
  sendTemplate?(input: ProviderSendTemplateInput): Promise<ProviderSendResult>;
  uploadMedia?(input: ProviderMediaUploadInput): Promise<{ mediaId: string }>;
  sendMedia?(input: ProviderSendMediaInput): Promise<ProviderSendResult>;
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

export function safeWhatsAppFailureMessage(error: unknown) {
  if (error instanceof WhatsAppProviderError) return error.message;
  return "Não foi possível enviar a mensagem pelo WhatsApp. Tente novamente ou revalide a conexão.";
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
  const message = retryable
    ? "A Meta está temporariamente indisponível. Tente novamente em alguns instantes."
    : response.status === 401 || response.status === 403
      ? "A conexão com o WhatsApp precisa ser revalidada pelo suporte do PedeAqui."
      : "A Meta rejeitou o envio. Revise a conexão do WhatsApp ou o modelo de mensagem aprovado.";
  return new WhatsAppProviderError(message, response.status, code, retryable);
}

const PROVIDER_TIMEOUT_MS = 8_000;

type MessageResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; code?: number; type?: string };
} | null;

function providerNetworkError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const timedOut = name === "AbortError" || name === "TimeoutError";
  return new WhatsAppProviderError(
    timedOut
      ? "A Meta demorou para responder. Tente novamente em alguns instantes."
      : "Não foi possível conectar à Meta. Tente novamente em alguns instantes.",
    timedOut ? 408 : 503,
    timedOut ? "network_timeout" : "network_error",
    true,
  );
}

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
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      throw providerNetworkError(error);
    }
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

  async uploadMedia(input: ProviderMediaUploadInput): Promise<{ mediaId: string }> {
    const version = resolveWhatsAppGraphVersion();
    const form = new FormData();
    form.set("messaging_product", "whatsapp");
    form.set("type", input.mimeType);
    form.set("file", new Blob([Buffer.from(input.bytes)], { type: input.mimeType }), input.filename);
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(input.phoneNumberId)}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => null) as { id?: string; error?: { message?: string; code?: number; type?: string } } | null;
    if (!response.ok || !payload?.id) throw providerError(response, payload);
    return { mediaId: payload.id };
  }

  async sendMedia(input: ProviderSendMediaInput): Promise<ProviderSendResult> {
    const media: Record<string, unknown> = { id: input.mediaId };
    if (input.caption && input.mediaType !== "audio") media.caption = input.caption.slice(0, 1024);
    if (input.filename && input.mediaType === "document") media.filename = input.filename.slice(0, 240);
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipient,
      type: input.mediaType,
      [input.mediaType]: media,
    });
  }

  async sendReplyButton(input: ProviderSendReplyButtonInput): Promise<ProviderSendResult> {
    if (!/^[a-z0-9_]{1,64}$/.test(input.buttonId)) throw new Error("Identificador do botão do WhatsApp inválido.");
    if (input.buttonTitle.trim().length < 1 || input.buttonTitle.trim().length > 20) throw new Error("Título do botão do WhatsApp inválido.");
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipient,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: input.body },
        action: {
          buttons: [{ type: "reply", reply: { id: input.buttonId, title: input.buttonTitle.trim() } }],
        },
      },
    });
  }

  async listTemplates(businessAccountId: string): Promise<ProviderTemplateSummary[]> {
    if (!/^\d{5,40}$/.test(businessAccountId)) {
      throw new Error("Identificador da conta WhatsApp inválido.");
    }
    const version = resolveWhatsAppGraphVersion();
    const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(businessAccountId)}/message_templates`);
    url.searchParams.set("fields", "name,language,status,category,components");
    url.searchParams.set("limit", "100");
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const payload = await response.json().catch(() => null) as {
      data?: Array<{
        name?: string;
        language?: string;
        status?: string;
        category?: string;
        components?: Array<Record<string, unknown>>;
      }>;
      error?: { message?: string; code?: number; type?: string };
    } | null;
    if (!response.ok) throw providerError(response, payload);
    return (payload?.data ?? []).flatMap((template) => {
      if (!template.name || !template.language || template.status !== "APPROVED") return [];
      const components = Array.isArray(template.components) ? template.components : [];
      const body = components.find((component) => component.type === "BODY");
      const bodyText = typeof body?.text === "string" ? body.text : "";
      if (!bodyText) return [];
      let bodyParameterCount = 0;
      for (const match of bodyText.matchAll(/\{\{(\d+)\}\}/g)) {
        bodyParameterCount = Math.max(bodyParameterCount, Number(match[1] ?? 0));
      }
      const unsupportedDynamicComponent = components.some((component) => {
        if (component.type === "BODY" || component.type === "FOOTER") return false;
        return JSON.stringify(component).includes("{{");
      });
      return [{
        name: template.name,
        language: template.language,
        status: template.status,
        category: template.category ?? null,
        bodyText,
        bodyParameterCount,
        supported: !unsupportedDynamicComponent,
      }];
    });
  }

  async sendTemplate(input: ProviderSendTemplateInput): Promise<ProviderSendResult> {
    if (!/^[a-z0-9_]{1,512}$/.test(input.templateName)) throw new Error("Nome de template do WhatsApp inválido.");
    if (!/^[a-z]{2}_[A-Z]{2}$/.test(input.languageCode)) throw new Error("Idioma do template do WhatsApp inválido.");
    const components = input.bodyParameters.length > 0 ? [{
      type: "body",
      parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
    }] : undefined;
    return this.sendMessage(input.phoneNumberId, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipient,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        ...(components ? { components } : {}),
      },
    });
  }
}
