import { describe, expect, it } from "vitest";
import { contextualOrderQuestion } from "@/server/conversations/whatsapp-contextual-question-core";

describe("WhatsApp contextual order questions", () => {
  it.each([
    "quais os sabores do pastel?",
    "quais sabores tem?",
    "que sabores vocês têm",
    "quais recheios",
    "opções de sabores",
  ])("recognizes flavor-list question: %s", (text) => {
    expect(contextualOrderQuestion(text)).toEqual({ type: "list_flavors" });
  });

  it.each([
    ["tem coxinha?", "coxinha"],
    ["vocês tem kibe", "quibe"],
    ["tem sabor de calabresa com queijo", "calabresa com queijo"],
  ])("recognizes flavor availability question: %s", (text, query) => {
    expect(contextualOrderQuestion(text)).toEqual({ type: "has_flavor", query });
  });

  it("does not intercept a composition statement", () => {
    expect(contextualOrderQuestion("15 coxinhas 10 bolinhas e 5 salsichas")).toBeNull();
  });
});
