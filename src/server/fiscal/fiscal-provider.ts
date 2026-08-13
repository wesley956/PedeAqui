export type FiscalProviderContext = {
  providerKey: string;
  environment: "sandbox" | "homologation" | "production";
  secret: string | null;
  config: Record<string, unknown>;
};

export type FiscalDocumentEnvelope = {
  document: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
};

export type FiscalIssueResult =
  | { status: "authorized"; providerDocumentId?: string | null; accessKey: string; protocol: string; code?: string | null; message?: string | null }
  | { status: "rejected"; providerDocumentId?: string | null; code?: string | null; message: string }
  | { status: "processing"; providerDocumentId: string; code?: string | null; message?: string | null }
  | { status: "contingency"; providerDocumentId?: string | null; code?: string | null; message?: string | null };

export type FiscalCancelResult = {
  status: "cancelled";
  cancellationProtocol: string;
  code?: string | null;
  message?: string | null;
};

export type FiscalWebhookEvent = {
  externalEventId: string;
  providerDocumentId?: string | null;
  accessKey?: string | null;
  status: "processing" | "authorized" | "rejected" | "cancelled" | "contingency";
  protocol?: string | null;
  cancellationProtocol?: string | null;
  code?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
};

export interface FiscalProvider {
  readonly key: string;
  issue(input: FiscalDocumentEnvelope, context: FiscalProviderContext): Promise<FiscalIssueResult>;
  cancel(input: FiscalDocumentEnvelope & { reason: string }, context: FiscalProviderContext): Promise<FiscalCancelResult>;
  verifyWebhook?(rawBody: string, headers: Headers, context: FiscalProviderContext): Promise<boolean> | boolean;
  parseWebhook?(rawBody: string, headers: Headers, context: FiscalProviderContext): Promise<FiscalWebhookEvent[]> | FiscalWebhookEvent[];
}

export type FiscalProviderResolver = (providerKey: string) => FiscalProvider | null;

export function resolveSecretReference(secretRef: string | null | undefined) {
  if (!secretRef) return null;
  return process.env[secretRef] ?? null;
}
