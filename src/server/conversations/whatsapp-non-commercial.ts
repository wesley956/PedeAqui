import { resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";

/** Business-agnostic, side-effect-free classification. Never resolves catalog products. */
export type NonCommercialIntent =
  | "job_candidate"
  | "supplier_contact"
  | "generic_business_contact"
  | "social_ad_context";

export type NonCommercialContext = { activeSession: boolean; campaignReply?: boolean };

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function isVagueMoreInfo(text: string) {
  return /^(?:(?:oi+|ola|bom dia|boa tarde|boa noite) )?(?:posso|poderia|gostaria de) (?:ter |receber )?mais informacoes(?: sobre (?:isso|isto))?$/.test(text)
    || /^(?:(?:oi+|ola|bom dia|boa tarde|boa noite) )?mais informacoes(?: sobre (?:isso|isto))?$/.test(text);
}

export function classifyNonCommercialContact(
  message: string | null | undefined,
  context: NonCommercialContext,
): NonCommercialIntent | null {
  const text = normalize(message);
  if (!text) return null;

  // Require employment intent, not merely "cozinha", "trabalho" or "vaga".
  if (/\b(?:vaga(?:s)? (?:de emprego|de trabalho|de freelance|para trabalhar|para (?:auxiliar|cozinheiro|cozinheira|atendente|entregador)|disponivel|disponiveis)|freelanc(?:e|er)|curriculo|candidato|contratando)\b/.test(text)
    || /\b(?:precisando|procurando) (?:de )?(?:auxiliar de cozinha|funcionario|funcionaria|cozinheiro|cozinheira)\b/.test(text)
    || /\b(?:quero|gostaria de|procuro) trabalhar (?:com|para|ai|aqui|no restaurante)\b/.test(text)) {
    return "job_candidate";
  }

  // Selling to the business is different from buying from its consumer catalog.
  if (/\b(?:sou|somos) (?:um |uma )?(?:fornecedor|fornecedora|distribuidor|distribuidora)\b/.test(text)
    || /\b(?:vendo|vendemos|forneco|fornecemos|ofereco|oferecemos)\b.*\b(?:embalagens?|caixas?|insumos?|materia prima)\b/.test(text)
    || /\b(?:compro|compramos|coletamos|recolhemos|compra de)\b.*\b(?:oleo usado|oleo de cozinha usado)\b/.test(text)) {
    return "supplier_contact";
  }

  // A vague follow-up is meaningful during an existing session. Do not hijack it.
  if (context.activeSession || context.campaignReply) return null;
  if (/\b(?:vi|vim|venho)\b.*\b(?:anuncio|instagram|facebook|publicacao)\b/.test(text)
    && !/\b(?:pedido|pedir|comprar|cardapio|preco|valor|produto|promocao|entrega|retirada)\b/.test(text)) {
    return "social_ad_context";
  }

  // Generic requests for information are intentionally NOT non-commercial.
  // They are common entry points for sales conversations. Keep them with the bot
  // unless a verified campaign reply provides explicit commercial context.
  return null;
}

/** Use the normal commercial menu for vague, verified campaign replies; preserve active drafts. */
export function isCampaignMenuFollowUp(message: string | null | undefined, context: NonCommercialContext) {
  if (!context.campaignReply || context.activeSession || resolveWhatsAppBotIntent(message, "menu") !== "unknown") return false;
  const text = normalize(message);
  if (!text) return false;
  if (isVagueMoreInfo(text)) return true;
  const intent = classifyNonCommercialContact(message, { activeSession: false });
  return intent === "social_ad_context";
}
