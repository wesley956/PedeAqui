import "server-only";

export type ProviderSendTextInput = {
  phoneNumberId: string;
  recipient: string;
  body: string;
};

export type ProviderSendResult = {
  externalMessageId: string;
};

export interface ConversationProvider {
  sendText(input: ProviderSendTextInput): Promise<ProviderSendResult>;
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

function requireGraphVersion() {
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

export class WhatsAppCloudProvider implements ConversationProvider {
  constructor(private readonly accessToken: string) {}

  async sendText(input: ProviderSendTextInput): Promise<ProviderSendResult> {
    const version = requireGraphVersion();
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.recipient,
        type: "text",
        text: { body: input.body },
      }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null) as { messages?: Array<{ id?: string }>; error?: { message?: string; code?: number } } | null;
    const externalMessageId = payload?.messages?.[0]?.id;
    if (!response.ok || !externalMessageId) {
      const detail = payload?.error?.message?.slice(0, 300) || `HTTP ${response.status}`;
      throw new Error(`WhatsApp Cloud API rejeitou a mensagem: ${detail}`);
    }
    return { externalMessageId };
  }
}
