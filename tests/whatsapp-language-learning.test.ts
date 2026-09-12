import { describe, expect, it } from "vitest";
import {
  classifyOrderLearningOutcome,
  decideLearnedAlias,
  extractSingleAddedProductLabel,
  sanitizeLearningPhrase,
} from "@/server/conversations/whatsapp-language-learning";

describe("WhatsApp language learning", () => {
  it("normalizes a learnable product phrase without keeping raw chat noise", () => {
    expect(sanitizeLearningPhrase("Eu quero uma caixa de 30 salgado então"))
      .toBe("quero uma caixa de 30 salgado");
  });

  it("rejects likely personal data instead of learning it", () => {
    expect(sanitizeLearningPhrase("me liga 19999998888")).toBeNull();
    expect(sanitizeLearningPhrase("Rua das Flores 123")).toBeNull();
    expect(sanitizeLearningPhrase("teste@email.com")).toBeNull();
  });

  it("classifies order recognition outcomes", () => {
    expect(classifyOrderLearningOutcome("Adicionei:\n1x Caixa com 30 salgados\n\nComo você quer receber?"))
      .toBe("resolved");
    expect(classifyOrderLearningOutcome("Encontrei algumas opções parecidas com caixa"))
      .toBe("ambiguous");
    expect(classifyOrderLearningOutcome("Ainda não consegui identificar caixa com segurança."))
      .toBe("unresolved");
  });

  it("extracts a single canonical product from a successful response", () => {
    expect(extractSingleAddedProductLabel("Adicionei:\n1x Caixa com 30 salgados\n\nComo você quer receber?"))
      .toBe("Caixa com 30 salgados");
    expect(extractSingleAddedProductLabel("Adicionei:\n1x Coxinha\n1x Refrigerante\n\nQual é seu nome?"))
      .toBeNull();
  });

  it("activates a correction after three consistent confirmations", () => {
    const events = Array.from({ length: 3 }, () => ({
      metadata: {
        outcome: "resolved",
        target_label: "Caixa com 30 salgados",
        evidence_source: "correction",
      },
    }));
    expect(decideLearnedAlias(events)).toBe("Caixa com 30 salgados");
  });

  it("does not activate conflicting learning", () => {
    const events = [
      ...Array.from({ length: 4 }, () => ({ metadata: { outcome: "resolved", target_label: "Caixa com 30 salgados", evidence_source: "correction" } })),
      { metadata: { outcome: "resolved", target_label: "Caixa com 50 salgados", evidence_source: "correction" } },
    ];
    expect(decideLearnedAlias(events)).toBeNull();
  });

  it("requires more evidence when there was no explicit correction", () => {
    const four = Array.from({ length: 4 }, () => ({ metadata: { outcome: "resolved", target_label: "Coca Cola", evidence_source: "direct" } }));
    const five = [...four, { metadata: { outcome: "resolved", target_label: "Coca Cola", evidence_source: "direct" } }];
    expect(decideLearnedAlias(four)).toBeNull();
    expect(decideLearnedAlias(five)).toBe("Coca Cola");
  });
});
