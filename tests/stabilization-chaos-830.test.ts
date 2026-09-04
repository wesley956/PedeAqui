import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyFailure } from "@/server/observability/failure-classification";
import { assertTransition } from "@/server/orders/state-machines";
import { redactSensitive } from "@/server/observability/redact";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const allSql = fs.readdirSync(path.join(root, "supabase/sql"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => fs.readFileSync(path.join(root, "supabase/sql", name), "utf8").toLowerCase())
  .join("\n");

describe("stabilization #830 controlled failure recovery", () => {
  it("classifies timeout, dependency and expired-session failures with practical recovery", () => {
    expect(classifyFailure({ status: 504 })).toMatchObject({ kind: "timeout", retryable: true });
    expect(classifyFailure({ status: 503 })).toMatchObject({ kind: "dependency", retryable: true });
    expect(classifyFailure({ status: 401 })).toMatchObject({ kind: "session", retryable: false });
    expect(classifyFailure({ status: 504 }).userMessage).toMatch(/tente novamente/i);
    expect(classifyFailure({ status: 401 }).userMessage).toMatch(/entre novamente/i);
  });

  it("reconciles a lost checkout response by cart identity instead of creating a duplicate order", () => {
    const service = read("src/server/orders/order-service.ts");
    expect(service).toContain("findExistingByCartToken");
    expect(service.indexOf("findExistingByCartToken")).toBeLessThan(service.indexOf("CheckoutService.review"));
    expect(allSql).toContain("from public.carts");
    expect(allSql).toMatch(/from public\.carts[\s\S]*for update/);
    expect(allSql).toContain("source_cart_id");
    expect(allSql).toContain("orders_source_cart_unique");
    expect(allSql).toContain("'created',false");
  });

  it("keeps Realtime failure visible while reconciling from the authoritative server state", () => {
    const hook = read("src/features/operations/use-operational-realtime.tsx");
    expect(hook).toContain('"connecting" | "connected" | "degraded"');
    expect(hook).toContain("degradedReconcileMs = 15_000");
    expect(hook).toContain("router.refresh()");
    expect(hook).toContain("Modo degradado · conferindo automaticamente");
    expect(hook).toContain('outcome: next === "connected" ? (previous === "degraded" ? "recovered"');
  });

  it("does not let concurrent operators bypass the order state machine", () => {
    expect(() => assertTransition("order", "completed", "confirmed")).toThrow();
    expect(() => assertTransition("fulfillment", "delivered", "out_for_delivery")).toThrow();
    expect(() => assertTransition("production", "ready", "preparing")).toThrow();
    expect(allSql).toContain("for update");
    expect(read("tests/concurrency-contracts.test.ts")).toContain("skip locked");
  });

  it("keeps optional integrations after core order persistence and never assumes payment on timeout", () => {
    const actions = read("src/features/orders/actions.ts");
    const created = actions.indexOf("OrderService.createFromCheckout(storeSlug, token)");
    expect(created).toBeGreaterThan(-1);
    for (const optional of [
      "OrderNotificationContextService.capture",
      'scheduleOrderWhatsAppNotifications("checkout.order_created")',
      "scheduleOrderPixCharge",
      "CustomerRecognitionService.issueFromOrder",
    ]) expect(actions.indexOf(optional, created)).toBeGreaterThan(created);
    expect(actions).toContain("customer_recognition_issue_failed");

    const health = read("src/server/operations/operational-health-service.ts");
    expect(health).toContain("O pedido continua com pagamento não confirmado; não presuma que foi pago.");
    expect(health).toContain("Formas manuais continuam seguindo a configuração do restaurante");
  });

  it("keeps printing failure independent from the order and provides explicit recovery", () => {
    const health = read("src/server/operations/operational-health-service.ts");
    const indicator = read("src/features/operations/operational-health-indicator.tsx");
    expect(health).toContain("Computador de impressão sem sinal");
    expect(health).toContain("Fila de impressão parada");
    expect(indicator).toContain("retryPrintJobAction");
    expect(indicator).toContain("recognizePrintedJobAction");
    expect(allSql).toContain("claimed_by_agent_id");
    expect(allSql).toContain("lease_expires_at");
  });

  it("redacts secrets/PII-shaped credentials from diagnostic logs", () => {
    expect(redactSensitive({
      token: "secret-token",
      password: "secret-password",
      authorization: "Bearer secret",
      apiKey: "secret-key",
      requestId: "safe-request-id",
    })).toEqual({
      token: "[REDACTED]",
      password: "[REDACTED]",
      authorization: "[REDACTED]",
      apiKey: "[REDACTED]",
      requestId: "safe-request-id",
    });
  });

  it("documents a staging-only chaos procedure with no real customer fixtures", () => {
    const doc = read("docs/observability/STABILIZATION_830_CHAOS_MATRIX.md");
    expect(doc).toContain("somente em CI/staging");
    expect(doc).toContain("Produção e contas reais não são usadas");
    expect(doc).toContain("Estado incerto");
    expect(doc).toContain("Dona Maria");
    expect(doc).toContain("WhatsApp, PIX online, reconhecimento de cliente, telemetria e impressão");
  });

  it("runs the database scenarios three times in a disposable local Supabase stack", () => {
    const workflow = read(".github/workflows/isolated-chaos.yml");
    const runner = read("scripts/run-isolated-chaos.sh");
    expect(workflow).toContain("supabase/setup-cli@v3");
    expect(workflow).toContain("version: 2.84.2");
    expect(runner).toContain("supabase start");
    expect(runner).toContain("supabase stop");
    expect(runner).toContain("for pass in 1 2 3");
    expect(runner).toContain("sort -t_ -k1,1n");
    expect(runner).toContain("quality_rls_isolation.sql");
    expect(runner).toContain("ISOLATED_CHAOS_RESULT=passed");
    expect(runner).not.toContain("supabase link");
    expect(runner).not.toContain("SUPABASE_ACCESS_TOKEN");
  });
});
