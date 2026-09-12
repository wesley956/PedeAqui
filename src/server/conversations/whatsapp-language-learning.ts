import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeProductLanguage } from "@/server/conversations/language-normalization";

export type WhatsAppLanguageOutcome = "resolved" | "ambiguous" | "unresolved";

type LearningMetadata = {
  phrase_key?: unknown;
  outcome?: unknown;
  target_label?: unknown;
  evidence_source?: unknown;
};

type LearningEvent = {
  metadata: LearningMetadata | null;
};

const EVENT_NAME = "px.whatsapp.language_learning";
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

async function insertEvent(input: {
  organizationId: string;
  storeId: string;
  phraseKey: string;
  outcome: WhatsAppLanguageOutcome;
  targetLabel?: string | null;
  evidenceSource?: "direct" | "correction";
}) {
  try {
    const admin = createAdminClient();
    const metadata = {
      phrase_key: input.phraseKey,
      outcome: input.outcome,
      ...(input.targetLabel ? { target_label: input.targetLabel.slice(0, 180) } : {}),
      ...(input.evidenceSource ? { evidence_source: input.evidenceSource } : {}),
    };
    const { error } = await admin.from("product_experience_events").insert({
      organization_id: input.organizationId,
      store_id: input.storeId,
      actor_user_id: null,
      session_id: null,
      order_id: null,
      event_name: EVENT_NAME,
      schema_version: 1,
      source: "derived",
      outcome: input.outcome === "resolved" ? "success" : input.outcome === "unresolved" ? "failure" : "unknown",
      duration_ms: null,
      metadata,
    });
    if (error) console.warn("whatsapp language learning event skipped", error.message);
  } catch (error) {
    console.warn("whatsapp language learning event skipped", error instanceof Error ? error.message : "unknown error");
  }
}

export class WhatsAppLanguageLearningService {
  static async recordOutcome(input: {
    organizationId: string;
    storeId: string;
    phrase: string;
    body: string;
  }) {
    const phraseKey = sanitizeLearningPhrase(input.phrase);
    const outcome = classifyOrderLearningOutcome(input.body);
    if (!phraseKey || !outcome) return;
    const targetLabel = outcome === "resolved" ? extractSingleAddedProductLabel(input.body) : null;
    await insertEvent({
      organizationId: input.organizationId,
      storeId: input.storeId,
      phraseKey,
      outcome,
      targetLabel,
      evidenceSource: targetLabel ? "direct" : undefined,
    });
  }

  static async recordCorrection(input: {
    organizationId: string;
    storeId: string;
    originalPhrase: string;
    resolvedBody: string;
  }) {
    const phraseKey = sanitizeLearningPhrase(input.originalPhrase);
    const targetLabel = extractSingleAddedProductLabel(input.resolvedBody);
    if (!phraseKey || !targetLabel) return;
    await insertEvent({
      organizationId: input.organizationId,
      storeId: input.storeId,
      phraseKey,
      outcome: "resolved",
      targetLabel,
      evidenceSource: "correction",
    });
  }

  static async findLearnedProductAlias(input: {
    organizationId: string;
    storeId: string;
    phrase: string;
  }) {
    const phraseKey = sanitizeLearningPhrase(input.phrase);
    if (!phraseKey) return null;
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.from("product_experience_events")
        .select("metadata")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .eq("event_name", EVENT_NAME)
        .contains("metadata", { phrase_key: phraseKey })
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) return null;
      return decideLearnedAlias((data ?? []) as LearningEvent[]);
    } catch {
      return null;
    }
  }
}
