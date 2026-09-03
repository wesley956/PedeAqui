import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  OPERATIONAL_HEALTH_THRESHOLDS,
  checkoutFailureBurst,
  hasUnrecoveredRealtimeFailure,
  isConfirmedOrderStale,
  isDeliveryRouteLate,
  isPendingOrderStuck,
} from "@/server/operations/operational-health-policy";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const now = Date.parse("2026-09-03T12:00:00.000Z");

describe("stabilization #831 operational observability", () => {
  it("uses useful bounded thresholds and clears alerts when the underlying condition recovers", () => {
    expect(OPERATIONAL_HEALTH_THRESHOLDS.pendingConfirmationMs).toBe(10 * 60_000);
    expect(OPERATIONAL_HEALTH_THRESHOLDS.staleConfirmedOrderMs).toBe(90 * 60_000);
    expect(OPERATIONAL_HEALTH_THRESHOLDS.deliveryRouteMs).toBe(90 * 60_000);
    expect(OPERATIONAL_HEALTH_THRESHOLDS.checkoutFailureThreshold).toBe(3);

    expect(isPendingOrderStuck({ orderStatus: "pending_confirmation", createdAt: "2026-09-03T11:49:00.000Z", now })).toBe(true);
    expect(isPendingOrderStuck({ orderStatus: "confirmed", createdAt: "2026-09-03T11:49:00.000Z", now })).toBe(false);
    expect(isPendingOrderStuck({ orderStatus: "pending_confirmation", createdAt: "2026-09-03T11:00:00.000Z", scheduledFor: "2026-09-03T13:00:00.000Z", now })).toBe(false);

    expect(isConfirmedOrderStale({ orderStatus: "confirmed", updatedAt: "2026-09-03T10:29:00.000Z", now })).toBe(true);
    expect(isConfirmedOrderStale({ orderStatus: "completed", updatedAt: "2026-09-03T10:00:00.000Z", now })).toBe(false);

    expect(isDeliveryRouteLate({ outForDeliveryAt: "2026-09-03T10:29:00.000Z", now })).toBe(true);
    expect(isDeliveryRouteLate({ outForDeliveryAt: "2026-09-03T10:29:00.000Z", deliveredAt: "2026-09-03T11:30:00.000Z", now })).toBe(false);
  });

  it("deduplicates realtime/checkout from sanitized telemetry and recognizes recovery", () => {
    const failedRealtime = [
      { event_name: "px.realtime.connection", outcome: "failure", occurred_at: "2026-09-03T11:59:00.000Z" },
      { event_name: "px.realtime.connection", outcome: "success", occurred_at: "2026-09-03T11:55:00.000Z" },
    ];
    expect(hasUnrecoveredRealtimeFailure(failedRealtime)).toBe(true);
    expect(hasUnrecoveredRealtimeFailure([
      ...failedRealtime,
      { event_name: "px.realtime.connection", outcome: "recovered", occurred_at: "2026-09-03T12:00:00.000Z" },
    ])).toBe(false);

    const checkout = Array.from({ length: 3 }, (_, index) => ({
      event_name: "px.checkout.step",
      outcome: "failure",
      occurred_at: `2026-09-03T11:5${index}:00.000Z`,
    }));
    expect(checkoutFailureBurst(checkout)).toBe(3);
  });

  it("keeps health queries store-scoped, bounded and free of order PII", () => {
    const service = read("src/server/operations/operational-health-service.ts");
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("store_id", context.storeId)');
    expect(service).toContain('.limit(100)');
    for (const forbidden of [
      "customer_name_snapshot",
      "customer_phone_snapshot",
      "customer_email_snapshot",
      "address_street_snapshot",
      "address_number_snapshot",
      "public_access_token_hash",
      "access_token_secret_id",
      "webhook_secret_id",
    ]) expect(service).not.toContain(forbidden);
  });

  it("distinguishes app, integration and local equipment and links recovery to the right area", () => {
    const service = read("src/server/operations/operational-health-service.ts");
    const indicator = read("src/features/operations/operational-health-indicator.tsx");
    for (const origin of ['origin: "app"', 'origin: "integration"', 'origin: "local_equipment"']) expect(service).toContain(origin);
    expect(indicator).toContain('printing") return { href: "/configuracoes/impressoes"');
    expect(indicator).toContain('payments") return { href: "/configuracoes/pagamentos"');
    expect(indicator).toContain('delivery") return { href: "/entregas"');
    expect(indicator).toContain("Origem:");
  });

  it("documents every required P0/P1 runbook, retention, cost and release gates", () => {
    const doc = read("docs/observability/STABILIZATION_831_RUNBOOKS.md");
    for (const heading of [
      "impressão offline/fila parada",
      "pedido preso",
      "Realtime degradado",
      "checkout falhando",
      "entrega em rota acima do esperado",
      "pagamento online indisponível",
      "rollback de deploy",
      "restauração de backup",
      "incidente de segurança",
    ]) expect(doc).toContain(heading);
    expect(doc).toContain("180 dias");
    expect(doc).toContain("não cria fornecedor externo");
    expect(doc).toContain("db:drift");
    expect(doc).toContain("run_data_integrity_diagnostics_internal()");
  });
});
