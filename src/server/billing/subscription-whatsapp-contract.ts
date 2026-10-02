import { z } from "zod";
import type { ProviderTemplateSummary } from "@/server/conversations/provider";

export const billingWhatsAppContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[1-9]\d{9,14}$/, "Informe o número com DDI e DDD, somente números."),
  enabled: z.boolean(),
  consentConfirmed: z.boolean(),
}).refine(contact => !contact.enabled || contact.consentConfirmed, "Confirme a autorização do responsável para receber avisos.");

export type BillingWhatsAppContact = z.infer<typeof billingWhatsAppContactSchema>;
export const BILLING_WHATSAPP_KINDS = ["due_soon", "due_today", "overdue", "suspended", "reactivated"] as const;
export type BillingWhatsAppKind = typeof BILLING_WHATSAPP_KINDS[number];

const templateName = z.string().regex(/^[a-z0-9_]{1,512}$/);
const senderSchema = z.object({
  phoneNumberId: z.string().regex(/^\d{5,40}$/),
  businessAccountId: z.string().regex(/^\d{5,40}$/),
  templates: z.object({ due_soon: templateName, due_today: templateName, overdue: templateName, suspended: templateName, reactivated: templateName }),
});

export function resolveBillingWhatsAppSender(env: Record<string, string | undefined>) {
  if (env.PEDEAQUI_BILLING_WHATSAPP_ENABLED !== "true") return { ready: false, reason: "disabled" } as const;
  let templates: unknown;
  try { templates = JSON.parse(env.PEDEAQUI_BILLING_WHATSAPP_TEMPLATES ?? ""); }
  catch { return { ready: false, reason: "invalid_configuration" } as const; }
  const parsed = senderSchema.safeParse({
    phoneNumberId: env.PEDEAQUI_BILLING_WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: env.PEDEAQUI_BILLING_WHATSAPP_BUSINESS_ACCOUNT_ID,
    templates,
  });
  if (!parsed.success || !env.PEDEAQUI_BILLING_WHATSAPP_ACCESS_TOKEN?.trim()) return { ready: false, reason: "invalid_configuration" } as const;
  // A fixed dedicated reference prevents fallback to a restaurant's token.
  return { ready: true, ...parsed.data, tokenSecretRef: "PEDEAQUI_BILLING_WHATSAPP_ACCESS_TOKEN" } as const;
}

export function billingWhatsAppContactFromMetadata(metadata: unknown): BillingWhatsAppContact | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const contact = billingWhatsAppContactSchema.safeParse((metadata as Record<string, unknown>).billing_whatsapp_contact);
  return contact.success ? contact.data : null;
}

export function prepareBillingWhatsAppTemplate(input: {
  notificationId: string;
  kind: BillingWhatsAppKind;
  contact: BillingWhatsAppContact | null;
  sender: ReturnType<typeof resolveBillingWhatsAppSender>;
  templates: ProviderTemplateSummary[];
  amountCents: number | null;
  dueAt: string | null;
}) {
  if (!input.sender.ready) return { ready: false, reason: input.sender.reason } as const;
  const contact = billingWhatsAppContactSchema.safeParse(input.contact);
  if (!contact.success || !contact.data.enabled || !contact.data.consentConfirmed) return { ready: false, reason: "financial_contact_missing" } as const;
  if (!z.string().uuid().safeParse(input.notificationId).success) return { ready: false, reason: "notification_invalid" } as const;
  const needsInvoice = ["due_soon", "due_today", "overdue"].includes(input.kind);
  if (needsInvoice && (input.amountCents === null || !Number.isSafeInteger(input.amountCents) || input.amountCents < 0 || !input.dueAt || !Number.isFinite(Date.parse(input.dueAt)))) {
    return { ready: false, reason: "invoice_invalid" } as const;
  }
  const bodyParameters = needsInvoice ? [
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.amountCents! / 100),
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(input.dueAt!)),
  ] : [];
  const sender = input.sender;
  const approved = input.templates.find(item => item.name === sender.templates[input.kind] && item.language === "pt_BR");
  if (!approved || approved.status !== "APPROVED" || approved.category !== "UTILITY" || !approved.supported || approved.bodyParameterCount !== bodyParameters.length) {
    return { ready: false, reason: "approved_billing_template_missing" } as const;
  }
  return {
    ready: true,
    idempotencyKey: `subscription-billing-whatsapp:${input.notificationId}`,
    phoneNumberId: sender.phoneNumberId,
    recipient: contact.data.phone,
    templateName: approved.name,
    languageCode: "pt_BR",
    bodyParameters,
  } as const;
}
