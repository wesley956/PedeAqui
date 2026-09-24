import { afterEach, describe, expect, it } from "vitest";
import { buildPublicMenuUrl as buildGreetingMenuUrl } from "@/server/conversations/greeting";
import {
  buildOrderTrackingUrl,
  buildPublicMenuUrl as buildNotificationMenuUrl,
} from "@/server/conversations/order-notification-model";

const originalPublicAppUrl = process.env.PUBLIC_APP_URL;

afterEach(() => {
  if (originalPublicAppUrl === undefined) delete process.env.PUBLIC_APP_URL;
  else process.env.PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("INT-EVOL-02 canonical public links", () => {
  it("never exposes the historical technical Vercel host to customers", () => {
    delete process.env.PUBLIC_APP_URL;
    expect(buildGreetingMenuUrl("https://cruz-iota.vercel.app", "dona-maria"))
      .toBe("https://pedeaqui.pp.ua/m/dona-maria");
    expect(buildNotificationMenuUrl("https://cruz-iota.vercel.app", "dona-maria"))
      .toBe("https://pedeaqui.pp.ua/m/dona-maria");
    expect(buildOrderTrackingUrl("https://cruz-iota.vercel.app", "dona-maria", "order-1", "token-1"))
      .toBe("https://pedeaqui.pp.ua/m/dona-maria/pedido/order-1/acesso?t=token-1");
  });

  it("blocks any technical Vercel deployment hostname, not only the historical one", () => {
    delete process.env.PUBLIC_APP_URL;
    expect(buildGreetingMenuUrl("https://pedeaqui-preview-abc123.vercel.app", "dona-maria"))
      .toBe("https://pedeaqui.pp.ua/m/dona-maria");
  });

  it("allows an explicit customer-facing origin override", () => {
    process.env.PUBLIC_APP_URL = "https://pedidos.exemplo.com";
    expect(buildGreetingMenuUrl("https://internal.example", "loja"))
      .toBe("https://pedidos.exemplo.com/m/loja");
  });
});
