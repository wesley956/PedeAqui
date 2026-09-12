export type WhatsAppIntelligenceFamily =
  | "intent_menu"
  | "product_language"
  | "quantity_package"
  | "composition_flavors"
  | "context_memory"
  | "edit_correction"
  | "delivery_address"
  | "payment"
  | "tracking"
  | "informal_language"
  | "multi_intent"
  | "fragmented_message"
  | "media_noise"
  | "security"
  | "social_recovery";

export type WhatsAppIntelligencePhase =
  | "menu"
  | "awaiting_tracking_code"
  | "order_items"
  | "order_name"
  | "order_fulfillment"
  | "order_address"
  | "order_payment"
  | "order_confirmation";

export type WhatsAppIntelligenceIntent =
  | "menu"
  | "menu_link"
  | "order_start"
  | "order_item"
  | "product_question"
  | "price_question"
  | "flavor_question"
  | "composition"
  | "order_edit"
  | "track_start"
  | "track_code"
  | "handoff"
  | "hours"
  | "payment"
  | "delivery"
  | "address"
  | "confirmation"
  | "social_ack"
  | "ignore_media"
  | "clarify"
  | "unknown";

export type WhatsAppIntelligenceRisk = "normal" | "high" | "critical";

export type WhatsAppIntelligenceScenario = {
  id: string;
  family: WhatsAppIntelligenceFamily;
  phase: WhatsAppIntelligencePhase;
  intent: WhatsAppIntelligenceIntent;
  risk: WhatsAppIntelligenceRisk;
  message: string;
  expectedAction: string;
  languageVariant: string;
};

type Seed = Omit<WhatsAppIntelligenceScenario, "id" | "languageVariant" | "message"> & {
  message: string;
};

export const WHATSAPP_FLOW_PHASES: WhatsAppIntelligencePhase[] = [
  "menu",
  "awaiting_tracking_code",
  "order_items",
  "order_name",
  "order_fulfillment",
  "order_address",
  "order_payment",
  "order_confirmation",
];

export const WHATSAPP_PROTECTED_INVARIANTS = [
  "menu continua acessível por texto e botão interativo",
  "pedido pelo WhatsApp só é criado após confirmação explícita",
  "número da capacidade da embalagem não vira quantidade de embalagens",
  "rastreamento não revela pedido sem vínculo seguro com o cliente",
  "handoff interrompe automação e entrega a conversa ao humano",
  "produto, preço e disponibilidade vêm do cardápio ativo da unidade",
  "produto ou modificador pausado não pode ser inventado nem adicionado",
  "taxa e regras de entrega vêm da configuração real da unidade",
  "formas de pagamento vêm da configuração real da unidade",
  "alterar/refazer pedido descarta o rascunho anterior sem duplicar itens",
  "perguntas intermediárias não apagam a etapa atual do pedido",
  "benefícios, cashback, pontos, cupons e promoções permanecem roteáveis",
  "mensagens duplicadas do provedor não geram resposta ou pedido duplicado",
  "falha de envio do provedor faz fallback seguro para atendimento humano",
  "isolamento organization_id/store_id permanece obrigatório em todas as consultas",
] as const;

const seeds: Seed[] = [
  { family: "intent_menu", phase: "menu", intent: "menu", risk: "normal", message: "menu", expectedAction: "mostrar opções sem marcar como erro" },
  { family: "intent_menu", phase: "menu", intent: "menu_link", risk: "normal", message: "quero ver o cardápio", expectedAction: "enviar cardápio da unidade" },
  { family: "intent_menu", phase: "menu", intent: "order_start", risk: "high", message: "eu queria fazer um pedido", expectedAction: "iniciar novo pedido, nunca rastreamento" },
  { family: "intent_menu", phase: "menu", intent: "order_start", risk: "high", message: "poderia pedir aqui", expectedAction: "iniciar pedido pelo WhatsApp" },

  { family: "product_language", phase: "order_items", intent: "order_item", risk: "high", message: "quero 30 salgado", expectedAction: "oferecer ou selecionar embalagem compatível sem inventar item" },
  { family: "product_language", phase: "order_items", intent: "order_item", risk: "high", message: "me vê uma caixa de 30", expectedAction: "resolver embalagem usando catálogo e pedir esclarecimento se houver duas opções" },
  { family: "product_language", phase: "order_items", intent: "product_question", risk: "normal", message: "tem coxinha", expectedAction: "consultar disponibilidade real no contexto atual" },
  { family: "product_language", phase: "order_items", intent: "price_question", risk: "normal", message: "preços", expectedAction: "oferecer cardápio ou perguntar qual produto deseja consultar" },

  { family: "quantity_package", phase: "order_items", intent: "order_item", risk: "critical", message: "uma caixa com 30 salgados", expectedAction: "interpretar como 1 embalagem de capacidade 30" },
  { family: "quantity_package", phase: "order_items", intent: "order_item", risk: "critical", message: "30 caixas de 30 salgados", expectedAction: "preservar pedido explícito de 30 embalagens" },
  { family: "quantity_package", phase: "order_items", intent: "order_item", risk: "high", message: "duas de 50", expectedAction: "usar referência anterior e quantidade 2" },
  { family: "quantity_package", phase: "order_items", intent: "clarify", risk: "high", message: "me vê 30", expectedAction: "não adivinhar produto; pedir esclarecimento" },

  { family: "composition_flavors", phase: "order_items", intent: "composition", risk: "high", message: "15 coxinha 10 bolinha e 5 salsicha", expectedAction: "compor total respeitando modificadores ativos" },
  { family: "composition_flavors", phase: "order_items", intent: "composition", risk: "high", message: "sortido", expectedAction: "distribuir entre sabores permitidos no produto pendente" },
  { family: "composition_flavors", phase: "order_items", intent: "flavor_question", risk: "normal", message: "quais os sabores do pastel", expectedAction: "listar modificadores ativos do produto pendente sem perder contexto" },
  { family: "composition_flavors", phase: "order_items", intent: "composition", risk: "high", message: "10 coxinha 10 queijo e o resto salsicha", expectedAction: "calcular restante contra capacidade da embalagem" },

  { family: "context_memory", phase: "order_items", intent: "order_item", risk: "high", message: "a menor", expectedAction: "resolver opção anterior de menor capacidade" },
  { family: "context_memory", phase: "order_items", intent: "composition", risk: "high", message: "as duas", expectedAction: "usar alternativas da pergunta anterior quando semanticamente válido" },
  { family: "context_memory", phase: "order_payment", intent: "product_question", risk: "high", message: "quais sabores mesmo", expectedAction: "responder consulta e retornar para pagamento preservando carrinho" },
  { family: "context_memory", phase: "order_fulfillment", intent: "delivery", risk: "high", message: "quanto fica a entrega", expectedAction: "responder sem perder etapa de recebimento" },

  { family: "edit_correction", phase: "order_name", intent: "order_edit", risk: "critical", message: "quero mudar o pedido", expectedAction: "reiniciar montagem sem manter rascunho antigo" },
  { family: "edit_correction", phase: "order_items", intent: "order_edit", risk: "high", message: "na verdade quero 50", expectedAction: "corrigir tamanho/quantidade anterior" },
  { family: "edit_correction", phase: "order_items", intent: "order_edit", risk: "high", message: "tira 5 queijo e coloca kibe", expectedAction: "editar composição sem duplicar item" },
  { family: "edit_correction", phase: "order_fulfillment", intent: "order_edit", risk: "high", message: "pensando bem vou retirar", expectedAction: "trocar recebimento mantendo pedido" },

  { family: "delivery_address", phase: "menu", intent: "delivery", risk: "normal", message: "faz entrega em Americana qual a taxa", expectedAction: "responder conforme configuração e pedir endereço/bairro quando necessário" },
  { family: "delivery_address", phase: "order_address", intent: "address", risk: "high", message: "você já tem meu endereço", expectedAction: "buscar endereço salvo com vínculo seguro" },
  { family: "delivery_address", phase: "order_address", intent: "address", risk: "high", message: "rua pau brasil 107 alvorada", expectedAction: "normalizar endereço sem exigir formato rígido desnecessariamente" },
  { family: "delivery_address", phase: "order_fulfillment", intent: "delivery", risk: "normal", message: "posso ir buscar", expectedAction: "interpretar como retirada" },

  { family: "payment", phase: "menu", intent: "payment", risk: "normal", message: "quais formas de pagamento", expectedAction: "listar métodos reais e personalizados" },
  { family: "payment", phase: "order_payment", intent: "payment", risk: "high", message: "posso pagar no pix na entrega", expectedAction: "orientar Pix na entrega conforme regra atual sem inventar método" },
  { family: "payment", phase: "order_payment", intent: "payment", risk: "high", message: "ticket refeição", expectedAction: "aceitar apenas se cadastrado e manter etapa correta" },
  { family: "payment", phase: "order_payment", intent: "order_edit", risk: "high", message: "não dinheiro, cartão", expectedAction: "trocar forma de pagamento sem reiniciar carrinho" },

  { family: "tracking", phase: "menu", intent: "track_start", risk: "normal", message: "cadê meu pedido", expectedAction: "pedir número do pedido" },
  { family: "tracking", phase: "awaiting_tracking_code", intent: "track_code", risk: "critical", message: "68", expectedAction: "buscar somente pedido vinculado com segurança" },
  { family: "tracking", phase: "menu", intent: "track_code", risk: "critical", message: "pedido 68", expectedAction: "rastrear diretamente somente com vínculo seguro" },
  { family: "tracking", phase: "menu", intent: "order_start", risk: "high", message: "quero fazer outro pedido", expectedAction: "iniciar compra, não rastreamento" },

  { family: "informal_language", phase: "order_items", intent: "order_item", risk: "normal", message: "qro 1 cx d 30 salgdo", expectedAction: "normalizar linguagem e resolver pelo catálogo" },
  { family: "informal_language", phase: "order_items", intent: "composition", risk: "normal", message: "10 cozinha 10 qjo 10 salsixa", expectedAction: "usar aliases apenas com confiança e contexto" },
  { family: "informal_language", phase: "menu", intent: "menu", risk: "normal", message: "meni", expectedAction: "reconhecer typo de menu quando confiança suficiente" },
  { family: "informal_language", phase: "order_items", intent: "order_item", risk: "normal", message: "cx30 pf", expectedAction: "entender abreviação quando houver opção inequívoca" },

  { family: "multi_intent", phase: "menu", intent: "order_start", risk: "high", message: "quero 30 salgados e quanto fica a entrega", expectedAction: "preservar pedido e responder intenção secundária sem perder contexto" },
  { family: "multi_intent", phase: "order_items", intent: "order_item", risk: "high", message: "uma caixa de 50 e uma coca 2 litros vou retirar", expectedAction: "extrair múltiplos itens e recebimento, perguntando só o que falta" },
  { family: "multi_intent", phase: "order_items", intent: "order_item", risk: "high", message: "50 salgados sortidos pago no cartão", expectedAction: "extrair produto composição e pagamento sem pular confirmação" },
  { family: "multi_intent", phase: "order_items", intent: "order_item", risk: "high", message: "30 salgados pra 22 horas e vou buscar", expectedAction: "extrair pedido horário e retirada sem inventar agendamento se indisponível" },

  { family: "fragmented_message", phase: "order_items", intent: "order_item", risk: "normal", message: "quero 50 salgado", expectedAction: "abrir composição e aguardar próximas partes" },
  { family: "fragmented_message", phase: "order_items", intent: "composition", risk: "normal", message: "20 coxinha", expectedAction: "acumular composição parcial" },
  { family: "fragmented_message", phase: "order_items", intent: "composition", risk: "normal", message: "mais 10 kibe", expectedAction: "continuar composição existente" },
  { family: "fragmented_message", phase: "order_items", intent: "clarify", risk: "normal", message: "e o resto", expectedAction: "pedir destino do restante quando não houver sabor implícito" },

  { family: "media_noise", phase: "menu", intent: "ignore_media", risk: "normal", message: "[reaction]", expectedAction: "não responder com erro e menu completo" },
  { family: "media_noise", phase: "menu", intent: "ignore_media", risk: "normal", message: "[sticker]", expectedAction: "ignorar ou responder leve sem alterar estado" },
  { family: "media_noise", phase: "menu", intent: "clarify", risk: "normal", message: "[image]", expectedAction: "não inventar conteúdo da imagem; orientar ou encaminhar" },
  { family: "media_noise", phase: "order_items", intent: "clarify", risk: "high", message: "https://app.anota.ai/m/exemplo", expectedAction: "não tratar link externo como item do carrinho" },

  { family: "security", phase: "awaiting_tracking_code", intent: "track_code", risk: "critical", message: "pedido da minha esposa é 68", expectedAction: "não revelar sem validação de vínculo" },
  { family: "security", phase: "order_confirmation", intent: "confirmation", risk: "critical", message: "acho que sim", expectedAction: "não criar pedido se confirmação não cumprir regra explícita" },
  { family: "security", phase: "order_items", intent: "order_item", risk: "critical", message: "quero a coxinha pausada", expectedAction: "não adicionar produto ou modificador inativo" },
  { family: "security", phase: "order_address", intent: "address", risk: "critical", message: "qual endereço está salvo aí", expectedAction: "mostrar somente dados do cliente corretamente vinculado" },

  { family: "social_recovery", phase: "menu", intent: "social_ack", risk: "normal", message: "ok", expectedAction: "responder naturalmente ou encerrar sem mensagem de erro" },
  { family: "social_recovery", phase: "menu", intent: "social_ack", risk: "normal", message: "valeu obrigado", expectedAction: "resposta curta e cordial sem menu forçado" },
  { family: "social_recovery", phase: "order_confirmation", intent: "clarify", risk: "high", message: "espera", expectedAction: "não confirmar e manter possibilidade de edição" },
  { family: "social_recovery", phase: "order_items", intent: "clarify", risk: "normal", message: "não entendi", expectedAction: "explicar etapa atual em linguagem simples" },
];

const variants = [
  ["base", (text: string) => text],
  ["greeting", (text: string) => `oi, ${text}`],
  ["please", (text: string) => `${text} por favor`],
  ["emoji", (text: string) => `${text} 😊`],
  ["question", (text: string) => `${text}?`],
  ["exclaim", (text: string) => `${text}!`],
  ["caps", (text: string) => text.toUpperCase()],
  ["no_accents", (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")],
  ["whitespace", (text: string) => `  ${text.replace(/ /g, "  ")}  `],
  ["context_prefix", (text: string) => `então ${text}`],
  ["polite_prefix", (text: string) => `me ajuda, ${text}`],
  ["night_prefix", (text: string) => `boa noite, ${text}`],
] as const;

export function buildWhatsAppIntelligenceMatrix(): WhatsAppIntelligenceScenario[] {
  return seeds.flatMap((seed, seedIndex) => variants.map(([languageVariant, transform], variantIndex) => ({
    ...seed,
    id: `wa-${String(seedIndex + 1).padStart(3, "0")}-${String(variantIndex + 1).padStart(2, "0")}`,
    message: transform(seed.message),
    languageVariant,
  })));
}

export function summarizeWhatsAppIntelligenceMatrix() {
  const matrix = buildWhatsAppIntelligenceMatrix();
  const byFamily = Object.fromEntries(
    [...new Set(matrix.map((scenario) => scenario.family))].map((family) => [
      family,
      matrix.filter((scenario) => scenario.family === family).length,
    ]),
  );
  const critical = matrix.filter((scenario) => scenario.risk === "critical").length;
  return { total: matrix.length, critical, byFamily };
}
