// Central normalization layer for informal Brazilian Portuguese used in WhatsApp conversations.
// It can normalize what the customer wrote, but must never invent a product that does not exist
// in the store catalog.

const PHRASE_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/\bbot menu open\b/g, "bot_menu_open"],
  [/\bcoz\s+inha\b/g, "coxinha"], [/\bcox\s+inha\b/g, "coxinha"], [/\bco\s+xinha\b/g, "coxinha"],
  [/\beu quero\b/g, "quero"], [/\beu queria\b/g, "quero"],
  [/\bme ve ai\b/g, "quero"], [/\bme ve\b/g, "quero"], [/\bme arruma\b/g, "quero"],
  [/\bmanda ai\b/g, "quero"], [/\bmanda pra mim\b/g, "quero"], [/\bsepara pra mim\b/g, "quero"],
  [/\bpode manda\b/g, "quero"], [/\bpode mandar\b/g, "quero"], [/\bja manda\b/g, "quero"],
  [/\bessa msm\b/g, "essa mesma"], [/\besse msm\b/g, "esse mesmo"], [/\bessa memo\b/g, "essa mesma"],
  [/\bpode ser essa\b/g, "essa mesma"], [/\bpode ser esse\b/g, "esse mesmo"], [/\be essa\b/g, "essa mesma"],
  [/\ba primeira\b/g, "opcao 1"], [/\ba segunda\b/g, "opcao 2"], [/\ba terceira\b/g, "opcao 3"],
  [/\ba quarta\b/g, "opcao 4"], [/\ba quinta\b/g, "opcao 5"],
  [/\bprimeira opcao\b/g, "opcao 1"], [/\bsegunda opcao\b/g, "opcao 2"], [/\bterceira opcao\b/g, "opcao 3"],
  [/\bopcao numero um\b/g, "opcao 1"], [/\bopcao numero dois\b/g, "opcao 2"], [/\bopcao numero tres\b/g, "opcao 3"],
  [/\bmeia duzia\b/g, "6"], [/\buma duzia\b/g, "12"], [/\bduas duzias\b/g, "24"], [/\btres duzias\b/g, "36"],
  [/\buma dezena\b/g, "10"], [/\bduas dezenas\b/g, "20"], [/\bmeio cento\b/g, "50"], [/\bum cento\b/g, "100"],
  [/\bsem cebola\b/g, "sem cebola"], [/\bsem queijo\b/g, "sem queijo"], [/\bsem molho\b/g, "sem molho"],
];

const WORD_ALIASES: Readonly<Record<string, string>> = {
  blz: "beleza", bza: "beleza", belza: "beleza", fmz: "beleza", suave: "beleza", fechow: "fechou",
  flw: "beleza", vlw: "valeu", obg: "obrigado", obgd: "obrigado", obgdo: "obrigado", brigado: "obrigado",
  ss: "sim", sss: "sim", siim: "sim", siiim: "sim", yep: "sim", yup: "sim", okk: "ok", okay: "ok",
  nn: "nao", naum: "nao", n: "nao", nope: "nao", nops: "nao",
  msm: "mesmo", memo: "mesmo", mermo: "mesmo", tb: "tambem", tbm: "tambem", tmb: "tambem",
  pq: "porque", q: "que", qro: "quero", qeru: "quero", keru: "quero", keria: "queria", queriaa: "queria",
  vcs: "voces", vc: "voce", cm: "com", c: "com", pra: "para", pro: "para", p: "para",
  agr: "agora", hj: "hoje", dps: "depois", antesd: "antes", ae: "ai", aiin: "ai", seila: "sei la",
  qtd: "quantidade", qnt: "quantidade", qnts: "quantidade", qtas: "quantidade",
  un: "unidade", und: "unidade", unid: "unidade", unds: "unidades", unids: "unidades",
  cx: "caixa", cxa: "caixa", cxs: "caixas", caixinha: "caixa", pct: "pacote", pc: "pacote", pcte: "pacote",
  dez: "10", vinte: "20", trinta: "30", quarenta: "40", cinquenta: "50", sessenta: "60", setenta: "70", oitenta: "80", noventa: "90", cem: "100",
  dz: "duzia", dzia: "duzia", cento: "100", meia: "metade",
  coxina: "coxinha", cochinha: "coxinha", coxinh: "coxinha", coxinhaa: "coxinha", coxinhas: "coxinha",
  coxinaaa: "coxinha", cochinaa: "coxinha", cochina: "coxinha",
  frgo: "frango", frg: "frango", frangoa: "frango", frangos: "frango", frangoos: "frango",
  qjo: "queijo", qj: "queijo", qeijo: "queijo", quejo: "queijo", keijo: "queijo", queijoos: "queijo",
  bolina: "bolinha", bolinhaa: "bolinha", bolinhas: "bolinha", bolimha: "bolinha", bolonha: "bolinha",
  salsixa: "salsicha", salxicha: "salsicha", salsichas: "salsicha", salcicha: "salsicha", sausicha: "salsicha",
  kibe: "quibe", quibi: "quibe", quibes: "quibe", kibes: "quibe",
  risoli: "risoles", risole: "risoles", risoles: "risoles", enroladinho: "enrolado",
  churro: "churros", xurros: "churros", churroses: "churros",
  refri: "refrigerante", refrig: "refrigerante", refrigerantes: "refrigerante", refrigerant: "refrigerante",
  coca: "coca cola", cocacola: "coca cola", "coca-cola": "coca cola", coke: "coca cola",
  guarana: "guarana", guaranaa: "guarana", fanta: "fanta", spritee: "sprite",
  hamb: "hamburguer", hamburger: "hamburguer", hamburgueres: "hamburguer", amburguer: "hamburguer", burguer: "hamburguer",
  xburguer: "x burger", xburger: "x burger", xbacon: "x bacon", xsalada: "x salada", xfrango: "x frango",
  batatafrita: "batata frita", fritas: "batata frita", batatinha: "batata frita",
  pizzaa: "pizza", pizzas: "pizza", calabreza: "calabresa", calabresa: "calabresa", mussarela: "mucarela",
  acai: "acai", assai: "acai", pacoca: "pacoca",
  catupiry: "catupiry", catupiri: "catupiry", cheddar: "cheddar", baconz: "bacon",
  pixx: "pix", piks: "pix", pic: "pix", din: "dinheiro", dindin: "dinheiro", cash: "dinheiro",
  cartao: "cartao", cartaoo: "cartao", creditoo: "credito", debitoo: "debito",
  entregaa: "entrega", entreg: "entrega", delivery: "entrega", delivry: "entrega", entregar: "entrega",
  retirar: "retirada", retiro: "retirada", retira: "retirada", buscar: "retirada", pega: "retirada", pego: "retirada",
};

const SAFE_CANONICAL_VOCABULARY = [
  "coxinha", "frango", "queijo", "bolinha", "salsicha", "quibe", "risoles", "churros", "refrigerante",
  "hamburguer", "pizza", "calabresa", "mucarela", "catupiry", "cheddar", "bacon", "batata", "frita",
  "caixa", "pacote", "unidade", "quantidade", "pedido", "entrega", "retirada", "dinheiro", "credito", "debito",
  "cardapio", "atendente", "promocao", "cashback", "pontos", "cupom", "confirmar", "cancelar",
] as const;

function base(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”‘’]/g, "\"")
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\b(\d{1,3})(unidade|unidades|unid|unds?|und)\b/g, "$1 $2")
    .replace(/[^a-z0-9\n,;:/+\- ]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

function autocorrectSafeToken(token: string) {
  if (token.length < 5 || /^\d+$/.test(token)) return token;
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of SAFE_CANONICAL_VOCABULARY) {
    const distance = levenshtein(token, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (!best) return token;
  if (bestDistance === 1) return best;
  if (token.length >= 7 && bestDistance === 2) return best;
  return token;
}

export function normalizeInformalPortuguese(value: string | null | undefined) {
  let normalized = base(value ?? "");
  for (const [pattern, replacement] of PHRASE_ALIASES) normalized = normalized.replace(pattern, replacement);
  const withAliases = normalized
    .split(/(\s+|\n|,|;)/)
    .map((part) => {
      if (/^(\s+|\n|,|;)$/.test(part)) return part;
      const aliased = WORD_ALIASES[part] ?? part;
      return aliased.includes(" ") ? aliased : autocorrectSafeToken(aliased);
    })
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  if (/^caixa\b/.test(withAliases)) return withAliases.replace(/^caixa\b/, "uma caixa");
  if (/^(pacote|combo|kit)\b/.test(withAliases)) return withAliases.replace(/^(pacote|combo|kit)\b/, "um $1");
  return withAliases;
}

export function singularizeLoosePortuguese(token: string) {
  if (token.length <= 4) return token;
  if (token.endsWith("oes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("aes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("is") && token.length > 5) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function looseTokenSimilarity(left: string, right: string) {
  const a = singularizeLoosePortuguese(normalizeInformalPortuguese(left).replace(/\s+/g, ""));
  const b = singularizeLoosePortuguese(normalizeInformalPortuguese(right).replace(/\s+/g, ""));
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return 0.9;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

export function normalizeProductLanguage(value: string | null | undefined) {
  return normalizeInformalPortuguese(value)
    .replace(/^(?:uma|um)\s+(?=(?:caixa|pacote|combo|kit)\b)/, "")
    .replace(/\b(?:entao|sei la|seila|tipo)\b/g, " ")
    .replace(/(\d+)\s*(?:litro|litros|lt|lts)\b/g, "$1l")
    .replace(/(\d+)\s*(?:mililitro|mililitros|ml)\b/g, "$1ml")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
