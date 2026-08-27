import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_RECOGNITION_MAX_AGE_SECONDS,
  createCustomerRecognitionToken,
  customerRecognitionCookieName,
  hashCustomerRecognitionToken,
} from "@/server/customers/recognition-token";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("customer recognition token", () => {
  it("uses opaque random tokens and deterministic SHA-256 hashes", () => {
    const first = createCustomerRecognitionToken();
    const second = createCustomerRecognitionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashCustomerRecognitionToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCustomerRecognitionToken(first)).toBe(hashCustomerRecognitionToken(first));
  });

  it("scopes the HttpOnly cookie name to a safe store slug", () => {
    expect(customerRecognitionCookieName("Loja-Centro")).toBe("pedeaqui_customer_loja-centro");
    expect(customerRecognitionCookieName("loja/estranha?x=1")).not.toMatch(/[/?=]/);
    expect(CUSTOMER_RECOGNITION_MAX_AGE_SECONDS).toBe(180 * 24 * 60 * 60);
  });
});

describe("[324] privacy and persistence contracts", () => {
  const migration = read("supabase/sql/91_customer_recognition.sql");
  const checkout = read("src/server/checkout/checkout-service.ts");
  const page = read("src/app/m/[slug]/checkout/page.tsx");
  const orderAction = read("src/features/orders/actions.ts");
  const recognition = read("src/server/customers/recognition-service.ts");

  it("persists a delivery snapshot only after a successful order and deduplicates addresses", () => {
    expect(migration).toContain("orders_persist_customer_address");
    expect(migration).toContain("after insert on public.orders");
    expect(migration).toContain("customer_addresses_customer_fingerprint_unique");
    expect(migration).toContain("on conflict (organization_id, customer_id, address_fingerprint)");
  });

  it("keeps recognition tokens server-only and stores only a hash", () => {
    expect(migration).toContain("create table if not exists public.customer_recognition_tokens");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.customer_recognition_tokens from public, anon, authenticated");
    expect(recognition).toContain("hashCustomerRecognitionToken(token)");
    expect(recognition).not.toContain("token: token");
  });

  it("never exposes saved addresses through phone lookup alone", () => {
    expect(checkout).toContain("CustomerRecognitionService.resolve");
    expect(checkout).toContain("recognized.customerId !== session.customer_id");
    expect(checkout).toContain("Por segurança, informe o endereço novamente neste dispositivo");
    expect(page).toContain("fulfillmentComplete && identityComplete && deliverySelected");
    expect(page).toContain("recognizedForSession && recognizedCustomer && recognizedCustomer.addresses.length > 0");
    expect(page).toContain("recognizedCustomer && !recognizedForSession");
    expect(page).toContain("Por segurança, confirme o endereço novamente para este WhatsApp");
  });

  it("reuses saved addresses through the canonical server-side delivery quote path", () => {
    expect(checkout).toContain("return this.saveAddress(storeSlug, token");
    expect(checkout).toContain("DeliveryQuoteService.quote");
    expect(page).toContain("useSavedCheckoutAddressAction");
    expect(page).toContain("Você pode reutilizar um endereço salvo");
    expect(page).toContain("Ou informe outro endereço");
    expect(page).toContain("Usar este endereço");
  });

  it("issues recognition only after order creation using an HttpOnly store-scoped cookie", () => {
    const createOrderAt = orderAction.indexOf("OrderService.createFromCheckout");
    const issueAt = orderAction.indexOf("CustomerRecognitionService.issueFromOrder");
    expect(createOrderAt).toBeGreaterThan(-1);
    expect(issueAt).toBeGreaterThan(createOrderAt);
    expect(orderAction).toContain("httpOnly: true");
    expect(orderAction).toContain("path: `/m/${storeSlug}`");
  });
});
