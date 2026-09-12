import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ModuleAvailability } from "@/modules/module-access";
import type { ModuleKey } from "@/modules/module-catalog";
import { resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { resolveWhatsAppAutomationCapabilities } from "@/server/conversations/whatsapp-automation-capability";
import { workflowEligibilityByNotification } from "@/server/conversations/order-workflow-visibility";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260912170000_growth_observability_1023.sql");

describe("#1023 campaign metrics and privacy", () => {
  it("preserves provider milestones instead of inventing unavailable statuses", () => {
    for (const field of ["sent_at", "delivered_at", "read_at", "failed_at", "last_status_at"]) {
      expect(migration).toContain(`add column if not exists ${field}`);
    }
    expect(migration).toContain("p_status in ('sent','delivered','read')");
    expect(migration).toContain("p_status in ('delivered','read')");
    expect(migration).toContain("p_status='read'");
  });

  it("scopes every metric to organization and store and documents attribution", () => {
    expect(migration).toContain("p_organization_id uuid,p_store_id uuid,p_window_days integer default 30,p_attribution_days integer default 7");
    expect(migration).toContain("organization_id=p_organization_id and store_id=p_store_id");
    expect(migration).toContain("não representam causalidade garantida");
    expect(migration).toContain("count(distinct o.id)");
    expect(migration).toContain("count(distinct r.id)");
  });

  it("stores operational dimensions without phone, message body or customer identity", () => {
    const table = migration.slice(migration.indexOf("create table if not exists public.growth_operational_events"), migration.indexOf("create index if not exists growth_operational_events_store_time_idx"));
    expect(table).not.toMatch(/phone|customer_id|message_body|content/);
    expect(table).toContain("counts jsonb");
    expect(table).toContain("duration_ms integer");
  });

  it("keeps internal metrics RPCs unavailable to browser roles", () => {
    expect(migration).toContain("revoke all on function public.growth_campaign_metrics_internal(uuid,uuid,integer,integer) from public,anon,authenticated");
    expect(migration).toContain("grant execute on function public.growth_campaign_metrics_internal(uuid,uuid,integer,integer) to service_role");
    expect(migration).toContain("private.has_permission(organization_id,store_id,'growth.view')");
  });
});

describe("#1023 operational wiring and dashboard truth", () => {
  const campaignWorker = read("src/server/growth/campaign-worker.ts");
  const orderWorker = read("src/server/conversations/order-notification-worker.ts");
  const closeWorker = read("src/server/conversations/conversation-auto-close-worker.ts");
  const bot = read("src/server/conversations/greeting-service.ts");
  const page = read("src/app/(app)/crescimento/campanhas/page.tsx");

  it("covers workers, auto-close, hidden workflow and bot fallback", () => {
    expect(campaignWorker).toContain('eventType: "campaign.worker"');
    expect(orderWorker).toContain('eventType: "order.notification"');
    expect(closeWorker).toContain('eventType: "conversation.auto_close"');
    expect(bot).toContain('reasonCode: "unknown_intent"');
    expect(bot).toContain('reasonCode: intent === "benefit_handoff" ? "benefit_handoff" : "handoff"');
  });

  it("labels assisted results and shows only persisted provider milestones", () => {
    expect(page).toContain("Retorno assistido em 7 dias");
    expect(page).toContain("data.metrics.methodology");
    expect(page).toContain("metrics?.delivered");
    expect(page).toContain("metrics?.read");
    expect(page).not.toContain("taxa de conversão garantida");
  });
});

describe("#1023 critical matrix repeated three times", () => {
  const available = (moduleKey: ModuleKey): ModuleAvailability => ({ moduleKey, available: true, reason: "available", missingDependencies: [] });
  const preferences = {
    order_received: true, order_confirmed: true, production_preparing: true, payment_paid: true,
    pickup_ready: true, pickup_completed: true, out_for_delivery: true, delivered: true, order_canceled: true,
  };

  for (let run = 1; run <= 3; run += 1) {
    it(`keeps workflow/channel/handoff decisions deterministic (run ${run}/3)`, () => {
      const eligibility = workflowEligibilityByNotification({
        orders_workflow_mode: "custom",
        orders_custom_workflow: { delivery: ["new", "finished"], pickup: ["new", "finished"], quickFinish: true },
      });
      const capabilities = resolveWhatsAppAutomationCapabilities({
        businessType: "restaurant",
        modules: { conversations: available("conversations"), production: available("production"), deliveries: available("deliveries") },
        channel: { configured: true, enabled: true, connectionStatus: "connected" },
        orderNotificationsEnabled: true, preferences, onlinePaymentReady: true, deliveryOperationEnabled: true, workflowEligibility: eligibility,
      });
      expect(capabilities.production_preparing.state).toBe("unavailable_workflow");
      expect(capabilities.out_for_delivery.state).toBe("unavailable_workflow");
      expect(capabilities.delivered.state).toBe("enabled");
      expect(resolveWhatsAppBotIntent("quero falar com alguém", "menu")).toBe("handoff");
      expect(resolveWhatsAppBotIntent("meu saldo está errado", "menu")).toBe("benefit_handoff");
    });
  }
});
