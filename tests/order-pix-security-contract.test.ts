import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("online Pix security contracts [327-328]", () => {
  it("keeps provider credentials server-side in Vault and provider tables service-role only", () => {
    const sql = read("supabase/sql/97_order_payment_providers.sql");
    expect(sql).toContain("vault.create_secret");
    expect(sql).toContain("vault.update_secret");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("alter table public.order_payment_provider_configs enable row level security");
    expect(sql).toContain("revoke all on table public.order_payment_provider_configs from anon, authenticated");
    expect(sql).toContain("grant execute on function public.order_payment_provider_credentials_internal(uuid,text) to service_role");
  });

  it("persists one active Pix charge with an idempotency key and replay protection", () => {
    const sql = read("supabase/sql/97_order_payment_providers.sql");
    expect(sql).toContain("order_payment_provider_charges_one_active_idx");
    expect(sql).toContain("where status in ('creating','pending')");
    expect(sql).toContain("order_payment_provider_charges_idempotency_unique");
    expect(sql).toContain("order_payment_provider_events_replay_unique");
    expect(sql).toContain("unique (store_id, provider, provider_event_id)");
  });

  it("confirms provider settlement through the authoritative payment ledger", () => {
    const pixService = read("src/server/payments/order-pix-service.ts");
    expect(pixService).toContain('admin.rpc("payment_confirm_internal"');
    expect(pixService).toContain('p_source: "integration"');
    expect(pixService).not.toContain('.from("orders").update({ payment_status');
    expect(pixService).toContain("PIX provider amount mismatch");
    expect(pixService).toContain("PIX provider reference mismatch");
    expect(pixService).toContain("PIX provider currency mismatch");
  });

  it("does not persist raw webhook payloads or secrets in webhook event storage", () => {
    const service = read("src/server/payments/mercado-pago-webhook-service.ts");
    const sql = read("supabase/sql/97_order_payment_providers.sql");
    expect(service).toContain('createHash("sha256").update(input.rawBody).digest("hex")');
    expect(sql).toContain("payload_sha256 text not null");
    expect(sql).not.toMatch(/raw_payload|raw_body|authorization_header/i);
  });

  it("only exposes Pix in checkout after an online provider is configured", () => {
    const methods = read("src/server/payments/store-payment-method-service.ts");
    const checkout = read("src/server/checkout/checkout-service.ts");
    expect(methods).toContain("OrderPaymentProviderConfigService.isOnlinePixReady");
    expect(methods).toContain("item.enabled && onlinePixReady");
    expect(checkout).toContain("pix_email_required");
    expect(checkout).toContain("!session.customer_email");
  });
});
