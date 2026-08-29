import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Mercado Pago resilience contracts", () => {
  it("uses typed provider errors without logging raw provider responses", () => {
    const provider = read("src/server/payments/providers/mercado-pago-order-provider.ts");
    expect(provider).toContain("class MercadoPagoProviderHttpError");
    expect(provider).toContain("this.status = status");
    expect(provider).toContain("this.code = code");
    expect(provider).not.toContain("JSON.stringify(body)");
    expect(provider).not.toContain("console.log(body)");
  });

  it("refreshes OAuth once on 401/403 and reuses the reserved Pix idempotency key", () => {
    const pix = read("src/server/payments/order-pix-service.ts");
    expect(pix).toContain("forceRefreshMercadoPagoCredentials(storeId)");
    expect(pix).toContain("error.status === 401 || error.status === 403");
    expect(pix).toContain("idempotencyKey: charge.idempotency_key");
    expect(pix).toContain("provider.createPixCharge(request)");
    expect(pix).toContain("provider.getOrder(providerOrderId)");
  });

  it("keeps health diagnostics coarse and outside the OAuth concurrency timestamp", () => {
    const config = read("src/server/payments/order-payment-provider-config-service.ts");
    expect(config).toContain('"mercado_pago_auth_failed"');
    expect(config).toContain('"mercado_pago_provider_unavailable"');
    expect(config).toContain('"reconciliation_failed"');
    const health = config.slice(config.indexOf("static async recordHealth"));
    expect(health).toContain("last_health_checked_at");
    expect(health).toContain("last_error_code");
    expect(health).not.toContain("updated_at:");
  });

  it("reconciles only stale pending Mercado Pago charges for enabled stores in bounded batches", () => {
    const service = read("src/server/payments/order-pix-reconciliation-service.ts");
    expect(service).toContain('const MAX_BATCH = 50');
    expect(service).toContain('.eq("provider", "mercado_pago")');
    expect(service).toContain('.eq("enabled", true)');
    expect(service).toContain('.is("revoked_at", null)');
    expect(service).toContain('.eq("status", "pending")');
    expect(service).toContain('.not("provider_order_id", "is", null)');
    expect(service).toContain('.limit(MAX_BATCH)');
    expect(service).toContain('last_error_code: "reconciliation_failed"');
  });

  it("protects the reconciliation endpoint with the existing internal job authentication", () => {
    const route = read("src/app/api/internal/payment-reconciliation/route.ts");
    const auth = read("src/server/jobs/internal-job-auth.ts");
    expect(route).toContain('authorizeInternalJob(request, "payment_reconciliation")');
    expect(route).toContain("OrderPixReconciliationService.runBatch()");
    expect(auth).toContain('"payment_reconciliation"');
  });

  it("schedules reconciliation through Vault + Supabase cron without embedding a bearer token", () => {
    const sql = read("supabase/sql/155_mercado_pago_reconciliation_scheduler.sql");
    expect(sql).toContain("pedeaqui_internal_payment_reconciliation_token");
    expect(sql).toContain("/api/internal/payment-reconciliation");
    expect(sql).toContain("*/2 * * * *");
    expect(sql).toContain("cron.unschedule('pedeaqui-payment-reconciliation')");
    expect(sql).toContain("private.invoke_internal_job('payment_reconciliation')");
    expect(sql).not.toMatch(/Authorization['\"]?\s*[,=:]\s*['\"]Bearer [A-Za-z0-9_-]{20,}/);
  });
});
