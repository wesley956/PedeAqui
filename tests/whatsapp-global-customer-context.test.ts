import { describe, expect, it } from "vitest";
import {
  asksAboutSavedAddress,
  asksForTrackingNumberHelp,
  formatSavedAddress,
} from "@/server/conversations/whatsapp-customer-context";

describe("WhatsApp global customer context", () => {
  it.each([
    "Você já sabe meu endereço?",
    "vc tem meu endereço cadastrado?",
    "meu endereço está salvo?",
    "já tem meu endereço registrado aí?",
  ])("recognizes saved-address questions globally: %s", (text) => {
    expect(asksAboutSavedAddress(text)).toBe(true);
  });

  it.each([
    "Não sei o número do pedido",
    "Não sei o número, voltei na página e não sei onde aparece",
    "onde vejo o número do pedido?",
    "esqueci o código do pedido",
    "não tenho o número",
  ])("recognizes tracking-number recovery requests: %s", (text) => {
    expect(asksForTrackingNumberHelp(text)).toBe(true);
  });

  it("does not confuse normal order messages with context recovery", () => {
    expect(asksAboutSavedAddress("quero 30 salgados")).toBe(false);
    expect(asksForTrackingNumberHelp("quero fazer um pedido")).toBe(false);
  });

  it("formats only the address that was explicitly loaded for the linked customer", () => {
    expect(formatSavedAddress({
      id: "addr-1",
      customer_id: "customer-1",
      label: "Casa",
      street: "Rua Exemplo",
      number: "123",
      complement: "Fundos",
      district: "Centro",
      city: "Americana",
      state: "SP",
      is_default: true,
    })).toBe("Casa: Rua Exemplo, 123, Fundos — Centro, Americana/SP");
  });
});
