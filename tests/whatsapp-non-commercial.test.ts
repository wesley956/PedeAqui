import { describe, expect, it } from "vitest";
import { classifyNonCommercialContact } from "@/server/conversations/whatsapp-non-commercial";

const positive = [
  ["vi que vocês estão precisando de auxiliar de cozinha", "job_candidate"],
  ["vaga de freelance", "job_candidate"],
  ["Gostaria de enviar meu currículo", "job_candidate"],
  ["sou fornecedor de caixas", "supplier_contact"],
  ["oferecemos embalagens e caixas", "supplier_contact"],
  ["vendo caixas: Cx 15x15x7: 30 unidades", "supplier_contact"],
  ["compro óleo usado", "supplier_contact"],
  ["fornecedor oferecendo compra de óleo usado", "supplier_contact"],
  ["vim pelo anúncio no Instagram", "social_ad_context"],
] as const;
const negative = [
  "Olá! Posso ter mais informações sobre isso?",
  "poderia receber mais informações sobre isto",
  "gostaria de mais informações sobre isso",
  "quero uma caixa de 30 salgados",
  "150 salgados. 50 churros",
  "Quantos sai o cento",
  "De salgados misto",
  "tem caixa para retirada?",
  "a cozinha já preparou meu pedido?",
  "vou buscar depois do trabalho",
  "tem vaga para estacionar?",
  "vi no anúncio a promoção, quero comprar",
  "vim pelo Instagram, quero ver o cardápio",
  "vocês usam óleo na cozinha?",
  "qual o preço da caixa?",
  "sim",
  "[image]",
  "",
];

describe("INT-EVOL-04 non-commercial contact corpus", () => {
  it.each(positive)("classifies %s before a commercial tool", (message, intent) => {
    expect(classifyNonCommercialContact(message, { activeSession: false })).toBe(intent);
  });
  it.each(negative)("preserves consumer language: %s", (message) => {
    expect(classifyNonCommercialContact(message, { activeSession: false })).toBeNull();
  });
  it("preserves contextual generic follow-ups and social references in an active session", () => {
    for (const message of ["Olá! Posso ter mais informações sobre isso?", "vim pelo anúncio no Instagram"]) {
      expect(classifyNonCommercialContact(message, { activeSession: true })).toBeNull();
    }
  });
  it("still detects an explicit business interruption during a draft", () => {
    for (const [message, intent] of positive.slice(0, 8)) {
      expect(classifyNonCommercialContact(message, { activeSession: true })).toBe(intent);
    }
  });
  it("does not mutate caller context", () => {
    const context = Object.freeze({ activeSession: true });
    classifyNonCommercialContact("vaga de freelance", context);
    expect(context).toEqual({ activeSession: true });
  });
});
