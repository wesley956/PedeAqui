// Business-agnostic normalization for global PedeAqui routing.
// Product names, flavors and store-specific vocabulary do not belong here.

const aliases: Readonly<Record<string, string>> = {
  blz: "beleza", bza: "beleza", belza: "beleza", flw: "beleza", vlw: "valeu",
  obg: "obrigado", obgd: "obrigado", obgdo: "obrigado", obgda: "obrigado", brigado: "obrigado",
  ss: "sim", sss: "sim", siim: "sim", nn: "nao", naum: "nao", n: "nao",
  msm: "mesmo", memo: "mesmo", tb: "tambem", tbm: "tambem", tmb: "tambem",
  pq: "porque", q: "que", qro: "quero", qeru: "quero", keru: "quero", vc: "voce", vcs: "voces",
  cm: "com", c: "com", pra: "para", pro: "para", p: "para", agr: "agora", hj: "hoje", dps: "depois",
  qtd: "quantidade", qnt: "quantidade", qnts: "quantidade", qtas: "quantidade",
  un: "unidade", und: "unidade", unid: "unidade", unds: "unidades", unids: "unidades",
  cx: "caixa", cxa: "caixa", cxs: "caixas", pct: "pacote", pcte: "pacote",
  meni: "menu", meniu: "menu", mennu: "menu",
  pixx: "pix", piks: "pix", pic: "pix", din: "dinheiro", dindin: "dinheiro",
  cartaoo: "cartao", creditoo: "credito", debitoo: "debito",
  entregaa: "entrega", entreg: "entrega", delivery: "entrega", delivry: "entrega",
  retirar: "retirada", retiro: "retirada", retira: "retirada", buscar: "retirada",
};

function base(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[^a-z0-9\n,;:/+\- ]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function normalizeGenericInformalPortuguese(value: string | null | undefined) {
  let normalized = base(value ?? "")
    .replace(/\bbot menu open\b/g, "bot_menu_open")
    .replace(/\beu quer(?:o|ia)\b/g, "quero")
    .replace(/\b(?:me ve ai|me ve|manda ai|manda pra mim|separa pra mim)\b/g, "quero")
    .replace(/\ba primeira\b/g, "opcao 1")
    .replace(/\ba segunda\b/g, "opcao 2")
    .replace(/\ba terceira\b/g, "opcao 3")
    .replace(/\bmeia duzia\b/g, "6")
    .replace(/\buma duzia\b/g, "12")
    .replace(/\bduas duzias\b/g, "24")
    .replace(/\btres duzias\b/g, "36");

  normalized = normalized
    .split(/(\s+|\n|,|;)/)
    .map((part) => (/^(\s+|\n|,|;)$/.test(part) ? part : (aliases[part] ?? part)))
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  if (/^caixa\b/.test(normalized)) return normalized.replace(/^caixa\b/, "uma caixa");
  if (/^(pacote|combo|kit)\b/.test(normalized)) return normalized.replace(/^(pacote|combo|kit)\b/, "um $1");
  return normalized;
}
