// Central normalization layer for informal Brazilian Portuguese used in WhatsApp conversations.
// It can normalize what the customer wrote, but must never invent a product that does not exist
// in the store catalog.

const PHRASE_ALIASES: ReadonlyArray<[RegExp, string]> = [
  [/\bme ve ai\b/g, "quero"],
  [/\bme ve\b/g, "quero"],
  [/\bme arruma\b/g, "quero"],
  [/\bmanda ai\b/g, "quero"],
  [/\bmanda pra mim\b/g, "quero"],
  [/\bsepara pra mim\b/g, "quero"],
  [/\bpode manda\b/g, "quero"],
  [/\bpode mandar\b/g, "quero"],
  [/\bessa msm\b/g, "essa mesma"],
  [/\besse msm\b/g, "esse mesmo"],
  [/\bpode ser essa\b/g, "essa mesma"],
  [/\bpode ser esse\b/g, "esse mesmo"],
  [/\ba primeira\b/g, "opcao 1"],
  [/\ba segunda\b/g, "opcao 2"],
  [/\ba terceira\b/g, "opcao 3"],
  [/\bprimeira opcao\b/g, "opcao 1"],
  [/\bsegunda opcao\b/g, "opcao 2"],
  [/\bterceira opcao\b/g, "opcao 3"],
  [/\bmeia duzia\b/g, "6"],
  [/\buma duzia\b/g, "12"],
  [/\bduas duzias\b/g, "24"],
  [/\buma dezena\b/g, "10"],
  [/\bmeio cento\b/g, "50"],
  [/\bum cento\b/g, "100"],
];

const WORD_ALIASES: Readonly<Record<string, string>> = {
  // chat / confirmations
  blz: "beleza", bza: "beleza", belza: "beleza", fmz: "beleza", flw: "beleza",
  vlw: "valeu", obg: "obrigado", obgd: "obrigado", obgdo: "obrigado", brigado: "obrigado",
  ss: "sim", sss: "sim", yep: "sim", yup: "sim", okk: "ok", okay: "ok",
  nn: "nao", nope: "nao", nops: "nao",
  msm: "mesmo", memo: "mesmo", mermo: "mesmo", tb: "tambem", tbm: "tambem",
  pq: "porque", qro: "quero", keru: "quero", keria: "queria", queriaa: "queria",
  vcs: "voces", vc: "voce", cm: "com", pra: "para", pro: "para",

  // order / quantity vocabulary
  qtd: "quantidade", qnt: "quantidade", qnts: "quantidade", qtas: "quantidade",
  un: "unidade", und: "unidade", unid: "unidade", unds: "unidades", unids: "unidades",
  cx: "caixa", cxa: "caixa", cxs: "caixas", pct: "pacote", pc: "pacote",
  dz: "duzia",

  // food vocabulary / common mobile typos
  coxina: "coxinha", cochinha: "coxinha", coxinh: "coxinha", coxinhaa: "coxinha", coxinhas: "coxinha",
  frgo: "frango", frg: "frango", frangoa: "frango", frangos: "frango",
  qjo: "queijo", qj: "queijo", qeijo: "queijo", quejo: "queijo",
  bolina: "bolinha", bolinhaa: "bolinha", bolinhas: "bolinha",
  salsixa: "salsicha", salxicha: "salsicha", salsichas: "salsicha",
  churro: "churros", xurros: "churros",
  refri: "refrigerante", refrig: "refrigerante", refrigerantes: "refrigerante",
  cocacola: "coca cola", coke: "coca cola",
  hamb: "hamburguer", hamburger: "hamburguer", hamburgueres: "hamburguer",
  xburguer: "x burger", xburger: "x burger", xbacon: "x bacon",
  batatafrita: "batata frita", fritas: "batata frita",

  // payment / fulfillment informal forms
  pixx: "pix", din: "dinheiro", dindin: "dinheiro", cash: "dinheiro",
  entregaa: "entrega", entreg: "entrega", delivery: "entrega", retirar: "retirada", retiro: "retirada",
  buscar: "retirada", pega: "retirada", pego: "retirada",
};

function base(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”‘’]/g, "\"")
    .replace(/[^a-z0-9\n,;:/+\- ]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeInformalPortuguese(value: string | null | undefined) {
  let normalized = base(value ?? "");
  for (const [pattern, replacement] of PHRASE_ALIASES) normalized = normalized.replace(pattern, replacement);
  return normalized
    .split(/(\s+|\n|,|;)/)
    .map((part) => WORD_ALIASES[part] ?? part)
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export function singularizeLoosePortuguese(token: string) {
  if (token.length <= 4) return token;
  if (token.endsWith("oes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("aes")) return `${token.slice(0, -3)}ao`;
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
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
      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length]!;
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
    .replace(/(\d+)\s*(?:litro|litros|lt|lts)\b/g, "$1l")
    .replace(/(\d+)\s*(?:mililitro|mililitros|ml)\b/g, "$1ml")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
