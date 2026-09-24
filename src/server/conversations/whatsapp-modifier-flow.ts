import type { CatalogProductDetails } from "@/server/intelligence/catalog-adapter";
import { looseTokenSimilarity, normalizeProductLanguage } from "@/server/conversations/language-normalization";
import { parseOrderComposition } from "@/server/conversations/whatsapp-order-context";

export type PendingModifierSelection = { modifierId: string; quantity: number };
export type PendingModifierFlow = {
  productId: string;
  name: string;
  quantity: number;
  currentGroupId: string;
  completedGroupIds: string[];
  selections: PendingModifierSelection[];
};

type ModifierGroup = CatalogProductDetails["modifierGroups"][number];

type ResolveGroupResult =
  | { ok: true; selections: PendingModifierSelection[] }
  | { ok: false; message: string };

const skipWords = new Set(["0", "pular", "pula", "nenhum", "nenhuma", "sem", "nao", "não", "nao quero", "não quero"]);
const stopWords = new Set(["a", "as", "o", "os", "de", "da", "das", "do", "dos", "com", "e", "em", "no", "na", "nos", "nas"]);

function tokens(value: string) {
  return normalizeProductLanguage(value).split(" ").filter((token) => token && !stopWords.has(token));
}

function score(label: string, name: string) {
  const query = tokens(label);
  const target = tokens(name);
  if (!query.length || !target.length) return 0;
  const tokenScore = query.reduce((sum, token) => sum + Math.max(...target.map((candidate) => looseTokenSimilarity(token, candidate)), 0), 0) / query.length;
  const normalizedLabel = normalizeProductLanguage(label);
  const normalizedName = normalizeProductLanguage(name);
  return Math.min(1, tokenScore * 0.85 + (normalizedName.includes(normalizedLabel) || normalizedLabel.includes(normalizedName) ? 0.15 : 0));
}

function resolveOne(label: string, group: ModifierGroup) {
  const normalized = normalizeProductLanguage(label);
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= group.modifiers.length) return group.modifiers[numeric - 1]!;
  const exact = group.modifiers.find((modifier) => normalizeProductLanguage(modifier.name) === normalized);
  if (exact) return exact;
  const ranked = group.modifiers
    .map((modifier) => ({ modifier, score: score(label, modifier.name) }))
    .sort((left, right) => right.score - left.score || left.modifier.name.localeCompare(right.modifier.name, "pt-BR"));
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score < 0.68 || (second && best.score - second.score < 0.08)) return null;
  return best.modifier;
}

function requiredMinimum(group: ModifierGroup) {
  return group.required ? Math.max(1, group.minSelection) : group.minSelection;
}

function priceSuffix(priceCents: number) {
  if (!priceCents) return "";
  return ` (+${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(priceCents / 100)})`;
}

export function buildModifierGroupPrompt(productName: string, group: ModifierGroup) {
  const options = group.modifiers.map((modifier, index) => `${index + 1} — ${modifier.name}${priceSuffix(modifier.priceCents)}`).join("\n");
  const minimum = requiredMinimum(group);
  const optional = minimum === 0 ? "\n0 — Sem adicional / pular" : "";
  if (group.selectionMode === "equal_split_options") {
    return `${productName} — ${group.name}\n${options}\n\nInforme a composição com quantidades. O total precisa dar ${group.distributionTotal} unidades.${optional}`;
  }
  if (group.selectionMode === "quantity_per_option") {
    return `${productName} — ${group.name}\n${options}\n\nInforme quantidade e opção, por exemplo: 2 Bacon, 1 Queijo. Mínimo ${minimum}, máximo ${group.maxSelection}.${optional}`;
  }
  const rule = group.maxSelection === 1 ? "Escolha 1 opção." : `Escolha de ${minimum} até ${group.maxSelection} opções, separadas por vírgula.`;
  return `${productName} — ${group.name}\n${options}\n\n${rule}${optional}`;
}

export function firstPendingModifierGroup(details: CatalogProductDetails, completedGroupIds: string[]) {
  const completed = new Set(completedGroupIds);
  return details.modifierGroups.find((group) => !completed.has(group.id)) ?? null;
}

export function createPendingModifierFlow(details: CatalogProductDetails, quantity: number): PendingModifierFlow | null {
  const group = firstPendingModifierGroup(details, []);
  if (!group) return null;
  return {
    productId: details.id,
    name: details.name,
    quantity,
    currentGroupId: group.id,
    completedGroupIds: [],
    selections: [],
  };
}

export function resolveModifierGroupInput(text: string, group: ModifierGroup): ResolveGroupResult {
  const normalized = normalizeProductLanguage(text);
  const minimum = requiredMinimum(group);
  if (skipWords.has(normalized)) {
    if (minimum === 0) return { ok: true, selections: [] };
    return { ok: false, message: `${group.name} é obrigatório. Escolha pelo menos ${minimum} opção.` };
  }

  if (group.selectionMode === "equal_split_options") {
    const total = group.distributionTotal;
    if (!Number.isInteger(total) || !total || total < 1) return { ok: false, message: `A configuração de ${group.name} está inválida no cardápio.` };
    const composition = parseOrderComposition(text, total);
    if (!composition) return { ok: false, message: `Informe ${group.name} com quantidades. O total precisa dar ${total} unidades.` };
    if (composition.total !== total) {
      const diff = total - composition.total;
      return { ok: false, message: diff > 0 ? `Faltam ${diff} unidades para completar ${total}.` : `Retire ${Math.abs(diff)} unidades para ficar em ${total}.` };
    }
    const selections: PendingModifierSelection[] = [];
    for (const part of composition.parts) {
      const modifier = resolveOne(part.normalizedLabel, group);
      if (!modifier) return { ok: false, message: `Não consegui identificar “${part.label}” em ${group.name}. Use o nome como aparece no cardápio.` };
      const existing = selections.find((selection) => selection.modifierId === modifier.id);
      if (existing) existing.quantity += part.quantity;
      else selections.push({ modifierId: modifier.id, quantity: part.quantity });
    }
    if (selections.length < minimum || selections.length > group.maxSelection) {
      return { ok: false, message: `${group.name} aceita de ${minimum} até ${group.maxSelection} opções diferentes.` };
    }
    return { ok: true, selections };
  }

  if (group.selectionMode === "quantity_per_option") {
    const parts = text.split(/[\n;,]+/).map((part) => part.trim()).filter(Boolean);
    const selections: PendingModifierSelection[] = [];
    for (const part of parts) {
      const match = part.match(/^(\d{1,3})\s*(?:x|un|unid(?:ade)?s?)?\s+(.+)$/i);
      const quantity = match ? Number(match[1]) : 1;
      const label = match ? match[2]!.trim() : part;
      const modifier = resolveOne(label, group);
      if (!modifier) return { ok: false, message: `Não consegui identificar “${label}” em ${group.name}.` };
      const existing = selections.find((selection) => selection.modifierId === modifier.id);
      if (existing) existing.quantity += quantity;
      else selections.push({ modifierId: modifier.id, quantity });
    }
    const count = selections.reduce((sum, selection) => sum + selection.quantity, 0);
    if (count < minimum || count > group.maxSelection) return { ok: false, message: `${group.name} exige entre ${minimum} e ${group.maxSelection} unidades selecionadas.` };
    return { ok: true, selections };
  }

  const parts = text.split(/[\n;,]+/).map((part) => part.trim()).filter(Boolean);
  const selections: PendingModifierSelection[] = [];
  for (const part of parts) {
    const modifier = resolveOne(part, group);
    if (!modifier) return { ok: false, message: `Não consegui identificar “${part}” em ${group.name}.` };
    if (!selections.some((selection) => selection.modifierId === modifier.id)) selections.push({ modifierId: modifier.id, quantity: 1 });
  }
  if (selections.length < minimum || selections.length > group.maxSelection) return { ok: false, message: `${group.name} aceita de ${minimum} até ${group.maxSelection} opções.` };
  return { ok: true, selections };
}
