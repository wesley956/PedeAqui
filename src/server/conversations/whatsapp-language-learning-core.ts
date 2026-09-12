import { normalizeProductLanguage } from "@/server/conversations/language-normalization";

export type WhatsAppLanguageOutcome = "resolved" | "ambiguous" | "unresolved";

export type LearningMetadata = {
  phrase_key?: unknown;
  outcome?: unknown;
  target_label?: unknown;
  evidence_source?: unknown;
};

export type LearningEvent = {
  metadata: LearningMetadata | null;
};

const MAX_PHRASE_LENGTH = 180;
const CORRECTION_ACTIVATION_THRESHOLD = 3;
const DIRECT_ACTIVATION_THRESHOLD = 5;

const PII_PATTERN = /(?:https?:\/\/|www\.|\b\S+@\S+\.\S+\b|(?:\+?\d[\s().-]*){8,})/i;
const ADDRESS_PATTERN = /\b(?:rua|avenida|av\.?|alameda|travessa|rodovia|estrada|cep|endereco)\b/i;

export function sanitizeLearningPhrase(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw || raw.length > 500 || PII_PATTERN.test(raw) || ADDRESS_PATTERN.test(raw)) return null;
  const normalized = normalizeProductLanguage(raw)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_PHRASE_LENGTH);
  if (normalized.length < 3) return null;
  const tokenCount = normalized.split(" ").filter(Boolean).length;
  if (tokenCount > 30) return null;
  return normalized;
}

export function classifyOrderLearningOutcome(body: string | null | undefined): WhatsAppLanguageOutcome | null {
  const value = (body ?? "").trim();
  if (!value) return null;
  if (/^Adicionei:/i.test(value)) return "resolved";
  if (/^Encontrei algumas op(?:ç|c)ões parecidas/i.test(value)) return "ambiguous";
  if (/^Ainda não consegui identificar/i.test(value) || /^Me diga a quantidade e o produto/i.test(value)) return "unresolved";
  return null;
}

export function extractSingleAddedProductLabel(body: string | null | undefined) {
  const value = (body ?? "").trim();
  if (!/^Adicionei:/i.test(value)) return null;
  const firstSection = value.split(/\n\s*\n/)[0] ?? "";
  const labels = firstSection
    .split("\n")
    .slice(1)
    .map((line) => line.match(/^\s*\d+x\s+(.+?)\s*$/i)?.[1]?.trim() ?? null)
    .filter((label): label is string => Boolean(label));
  return labels.length === 1 ? labels[0]! : null;
}

export function decideLearnedAlias(events: LearningEvent[]) {
  const corrections = new Map<string, number>();
  const direct = new Map<string, number>();

  for (const event of events) {
    const metadata = event.metadata;
    const target = typeof metadata?.target_label === "string" ? metadata.target_label.trim() : "";
    if (!target || metadata?.outcome !== "resolved") continue;
    const source = metadata?.evidence_source === "correction" ? "correction" : "direct";
    const bucket = source === "correction" ? corrections : direct;
    bucket.set(target, (bucket.get(target) ?? 0) + 1);
  }

  const labels = new Set([...corrections.keys(), ...direct.keys()]);
  if (labels.size !== 1) return null;
  const [label] = [...labels];
  if (!label) return null;
  const correctionCount = corrections.get(label) ?? 0;
  const directCount = direct.get(label) ?? 0;
  if (correctionCount >= CORRECTION_ACTIVATION_THRESHOLD || directCount >= DIRECT_ACTIVATION_THRESHOLD) return label;
  return null;
}
