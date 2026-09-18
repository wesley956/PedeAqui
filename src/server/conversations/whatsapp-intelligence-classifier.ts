import { normalizeBotInput } from "@/server/conversations/bot-menu";
import type {
  WhatsAppIntelligenceIntent,
  WhatsAppIntelligencePhase,
  WhatsAppIntelligenceScenario,
} from "@/server/conversations/whatsapp-intelligence-lab";

export type WhatsAppIntentClassification = {
  intent: WhatsAppIntelligenceIntent;
  confidence: number;
  signals: string[];
};

function result(intent: WhatsAppIntelligenceIntent, confidence: number, ...signals: string[]): WhatsAppIntentClassification {
  return { intent, confidence, signals };
}

function hasAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

const orderEditPatterns = [
  /\b(?:mudar|alterar|trocar|refazer|recomecar)\b.*\bpedido\b/,
  /\bna verdade\b/,
  /\bpensando bem\b/,
  /\btira\b.*\b(?:coloca|poe|põe|troca)\b/,
  /\bnao\s+(?:dinheiro|cartao|credito|debito|entrega|retirada)\b/,
];

const orderStartPatterns = [
  /\b(?:quero|queria|gostaria de|posso|poderia|vou)\b.*\b(?:fazer|montar|iniciar)?\s*(?:um\s+)?pedido\b/,
  /\b(?:quero|queria|posso|poderia)\b.*\bpedir\b/,
  /\bpedido\s+pelo\s+whatsapp\b/,
  /\bpedir\s+por\s+aqui\b/,
  /\bfazer\s+outro\s+pedido\b/,
];

const trackingPatterns = [
  /\b(?:acompanhar|rastrear|status|andamento)\b.*\bpedido\b/,
  /\b(?:cade|cadê|onde esta|como esta|demora)\b.*\bpedido\b/,
  /\bmeu\s+pedido\b/,
  /\bfiz\s+(?:um\s+)?pedido\b.*\b(?:acompanhar|ver|status|demora)\b/,
];

const paymentPatterns = [
  /\b(?:pix|pics|piks|cartao|credito|debito|dinheiro|ticket|alelo|vale refeicao|vr)\b/,
  /\bformas?\s+de\s+pagamento\b/,
  /\bcomo\s+(?:posso|vou)\s+pagar\b/,
  /\bpagar\s+na\s+entrega\b/,
];

const deliveryPatterns = [
  /\b(?:entrega|delivery|frete|taxa de entrega|retirada|retirar|buscar)\b/,
  /\b(?:faz|tem|voces fazem|vocês fazem)\s+entrega\b/,
  /\bquanto\b.*\bentrega\b/,
  /\bposso\s+ir\s+buscar\b/,
];

const flavorQuestionPatterns = [
  /\bquais?\b.*\b(?:sabores?|recheios?)\b/,
  /\bque\b.*\b(?:sabores?|recheios?)\b/,
  /\bopcoes?\b.*\b(?:sabores?|recheios?)\b/,
  /\b(?:sabores?|recheios?)\s+disponiveis\b/,
];

const socialPatterns = [
  /^(?:ok|okay|blz|beleza|valeu|obrigad[oa]|brigad[oa]|show|fechou|combinado|certo|perfeito)(?:\s+.*)?$/,
  /\bmuito\s+obrigad[oa]\b/,
];

const productTokens = /\b(?:salgad[oa]s?|pasteis?|pastel|coxinh[ao]s?|kibe?s?|quibe?s?|bolinhas?|queijo|salsichas?|churros?|refrigerante|coca|caixa|copo|combo|kit|pacote|porcao)\b/;
const compositionTokens = /\b(?:sortido|variado|misturado|resto|restante|coxinh[ao]s?|kibe?s?|quibe?s?|bolinhas?|queijo|salsichas?|calabresa|presunto)\b/;
const quantityToken = /\b\d{1,4}\b/;

function numericTokens(value: string) {
  return [...value.matchAll(/\b\d{1,12}\b/g)].map((match) => match[0]);
}

export function classifyWhatsAppIntelligenceIntent(
  text: string | null | undefined,
  phase: WhatsAppIntelligencePhase,
): WhatsAppIntentClassification {
  const normalized = normalizeBotInput(text);
  if (!normalized) return result("unknown", 0.1, "empty");

  if (/^\[(?:reaction|sticker)\]$/.test(normalized)) return result("ignore_media", 0.99, "non-text-noise");
  if (/^\[image\]$/.test(normalized) || /https?:\/\//.test(String(text ?? ""))) return result("clarify", 0.96, "media-or-external-link");

  if (hasAny(normalized, orderEditPatterns)) return result("order_edit", 0.96, "edit-language");
  if (/\b(?:quero|queria)\s+mudar\b/.test(normalized) && phase !== "menu") return result("order_edit", 0.86, "contextual-edit");

  if (phase === "order_confirmation") {
    if (/^(?:sim|confirmo|pode confirmar|pode fechar|confirma)$/.test(normalized)) return result("confirmation", 0.99, "explicit-confirmation");
    if (/\b(?:espera|calma|pera|perai|pera ai)\b/.test(normalized)) return result("clarify", 0.98, "confirmation-hold");
    if (/\b(?:acho que sim|talvez|pode ser|creio que sim)\b/.test(normalized)) return result("clarify", 0.94, "non-explicit-confirmation");
  }

  if (hasAny(normalized, flavorQuestionPatterns)) return result("flavor_question", 0.97, "flavor-question");
  if (/\b(?:preco|precos|valor|valores|quanto custa|quanto fica)\b/.test(normalized) || (/\bquanto\b/.test(normalized) && /\b(?:ta|esta|custa|custam|fica|ficam|sai)\b/.test(normalized))) {
    if (/\bentrega\b/.test(normalized)) return result("delivery", 0.96, "delivery");
    return result("price_question", 0.91, "price-question");
  }

  if (hasAny(normalized, orderStartPatterns)) return result("order_start", 0.97, "new-order-language");

  const trackingNumbers = numericTokens(normalized);
  const explicitTrackingCode = normalized.match(/\b(?:pedido|codigo)\s*#?\s*(\d{1,12})\b/);
  if (explicitTrackingCode) return result("track_code", 0.99, "explicit-order-code");
  if (phase === "awaiting_tracking_code" && trackingNumbers.length === 1) return result("track_code", 0.99, "tracking-step-single-number");
  if (/\b(?:pedido|codigo)\b/.test(normalized) && trackingNumbers.length === 1) return result("track_code", 0.97, "tracking-context-single-number");
  if (hasAny(normalized, trackingPatterns)) return result("track_start", 0.95, "tracking-language");

  if (/\b(?:atendente|humano|falar com (?:o )?restaurante|falar com uma pessoa|chama alguem)\b/.test(normalized)) {
    return result("handoff", 0.98, "human-handoff");
  }
  if (/\b(?:horario|horarios|funcionamento|que horas abre|que horas fecha|esta aberto|esta aberta)\b/.test(normalized)) {
    return result("hours", 0.96, "hours-language");
  }

  if (phase === "order_address") {
    if (/\b(?:endereco|rua|avenida|av |bairro|cep|numero|número|ja tem meu endereco|tem meu endereco)\b/.test(normalized)) {
      return result("address", 0.9, "address-step");
    }
  }

  if (hasAny(normalized, paymentPatterns)) return result("payment", phase === "order_payment" ? 0.98 : 0.91, "payment-language");
  if (hasAny(normalized, deliveryPatterns)) return result("delivery", phase === "order_fulfillment" ? 0.98 : 0.91, "delivery-language");

  if (phase === "order_items") {
    if (/\b(?:tem|voces tem|vocês tem)\b/.test(normalized) && compositionTokens.test(normalized)) {
      return result("product_question", 0.9, "availability-question");
    }
    if (/\b(?:sortido|variado|misturado|um pouco de cada|por igual|distribui igual)\b/.test(normalized)) {
      return result("composition", 0.97, "composition-mode");
    }
    if (quantityToken.test(normalized) && compositionTokens.test(normalized) && !/\b(?:caixa|copo|combo|kit|pacote|porcao)\b/.test(normalized)) {
      return result("composition", 0.88, "quantity-plus-flavor");
    }
    if (/\b(?:a menor|a maior|a primeira|a segunda|a terceira|as duas)\b/.test(normalized)) {
      return result(/\bas duas\b/.test(normalized) ? "composition" : "order_item", 0.72, "context-reference");
    }
    if (/\b(?:resto|restante)\b/.test(normalized) && !compositionTokens.test(normalized.replace(/\b(?:resto|restante)\b/g, ""))) {
      return result("clarify", 0.75, "incomplete-remainder");
    }
    if (productTokens.test(normalized)) return result("order_item", quantityToken.test(normalized) ? 0.91 : 0.76, "catalog-language");
  }

  if (/\b(?:cardapio|cardápio)\b/.test(normalized)) return result("menu_link", 0.98, "menu-link");
  if (/^(?:menu|inicio|iniciar|oi|ola|oie|bom dia|boa tarde|boa noite|ver opcoes)$/.test(normalized)) return result("menu", 0.98, "menu-language");

  if (hasAny(normalized, socialPatterns)) return result("social_ack", 0.95, "social-ack");
  if (/\b(?:nao entendi|não entendi|como assim)\b/.test(normalized)) return result("clarify", 0.92, "help-needed");

  if (phase === "order_items" && quantityToken.test(normalized)) return result("clarify", 0.55, "quantity-without-product");
  return result("unknown", 0.25, "no-rule");
}

export function scoreWhatsAppIntelligenceMatrix(scenarios: WhatsAppIntelligenceScenario[]) {
  const classifications = scenarios.map((scenario) => ({
    scenario,
    classification: classifyWhatsAppIntelligenceIntent(scenario.message, scenario.phase),
  }));
  const recognized = classifications.filter(({ classification }) => classification.intent !== "unknown").length;
  const exact = classifications.filter(({ scenario, classification }) => classification.intent === scenario.intent).length;
  const criticalUnknown = classifications.filter(({ scenario, classification }) => scenario.risk === "critical" && classification.intent === "unknown").length;
  return {
    total: scenarios.length,
    recognized,
    exact,
    criticalUnknown,
    recognitionRate: scenarios.length ? recognized / scenarios.length : 0,
    exactRate: scenarios.length ? exact / scenarios.length : 0,
  };
}
