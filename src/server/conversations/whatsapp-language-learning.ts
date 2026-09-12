import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  classifyOrderLearningOutcome,
  decideLearnedAlias,
  extractSingleAddedProductLabel,
  sanitizeLearningPhrase,
  type LearningEvent,
  type WhatsAppLanguageOutcome,
} from "@/server/conversations/whatsapp-language-learning-core";

export {
  classifyOrderLearningOutcome,
  decideLearnedAlias,
  extractSingleAddedProductLabel,
  sanitizeLearningPhrase,
};
export type { WhatsAppLanguageOutcome };

const EVENT_NAME = "px.whatsapp.language_learning";

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
