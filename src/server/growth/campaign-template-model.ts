import { z } from "zod";

export class CampaignTemplateValidationError extends Error {}

export const campaignTemplateInputSchema = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Use letras minúsculas, números e sublinhado no nome."),
  language: z.literal("pt_BR").default("pt_BR"),
  body: z.string().trim().min(10, "Escreva a mensagem da campanha.").max(1024),
}).superRefine((input, ctx) => {
  const withoutName = input.body.replaceAll("{{1}}", "");
  if (/[{}]/.test(withoutName)) ctx.addIssue({ code: "custom", path: ["body"], message: "A única variável disponível é {{1}}, para o nome do cliente." });
});
export type CampaignTemplateInput = z.input<typeof campaignTemplateInputSchema>;
export type CampaignTemplate = {
  id: string; name: string; language: string; status: string; category: string;
  bodyText: string; usesCustomerName: boolean; supported: boolean;
};
export function normalizeCampaignTemplate(raw: Record<string, unknown>): CampaignTemplate | null {
  if (typeof raw.name !== "string" || typeof raw.language !== "string" || typeof raw.status !== "string") return null;
  const components = Array.isArray(raw.components) ? raw.components.filter(c => c && typeof c === "object") as Record<string, unknown>[] : [];
  const body = components.find(c => c.type === "BODY");
  const bodyText = typeof body?.text === "string" ? body.text : "";
  const supported = components.length === 1 && components[0]?.type === "BODY"
    && bodyText.length > 0 && !/[{}]/.test(bodyText.replaceAll("{{1}}", ""));
  return { id: String(raw.id ?? ""), name: raw.name, language: raw.language, status: raw.status,
    category: String(raw.category ?? ""), bodyText, usesCustomerName: bodyText.includes("{{1}}"), supported };
}
export function requireApprovedCampaignTemplate(templates: CampaignTemplate[], name: string, language: string, usesCustomerName: boolean) {
  const template = templates.find(t => t.name === name && t.language === language);
  if (!template || template.status !== "APPROVED" || template.category !== "MARKETING" || !template.supported)
    throw new CampaignTemplateValidationError("Escolha um modelo de marketing de texto aprovado para o WhatsApp desta unidade.");
  if (template.usesCustomerName !== usesCustomerName) throw new CampaignTemplateValidationError("A variável de nome deve corresponder ao modelo aprovado.");
  return template;
}
