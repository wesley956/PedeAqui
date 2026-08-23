import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/sql/124_client_01_operational_profile.sql");
const hardeningSql = read("supabase/sql/125_client_01_route_campaign_hardening.sql");
const concurrencySql = read("supabase/sql/126_client_01_campaign_concurrency_hardening.sql");
const providerStatusSql = read("supabase/sql/127_client_01_campaign_provider_status.sql");
const schedulerSql = read("supabase/sql/128_internal_job_scheduler.sql");

describe("client 01 configurable operational profile", () => {
  it("keeps every new behavior opt-in and reversible", () => {
    expect(sql).toContain("orders_auto_accept boolean not null default false");
    expect(sql).toContain("orders_workflow_mode text not null default 'standard'");
    expect(sql).toContain("deliveries_auto_create_when_ready boolean not null default false");
    expect(sql).toContain("deliveries_driver_tracking_enabled boolean not null default false");
    expect(sql).toContain("growth_campaigns_enabled boolean not null default false");
    expect(sql).not.toMatch(/dflorentino9|@gmail\.com/i);
  });

  it("uses canonical transitions for autoaccept and ready delivery projection", () => {
    expect(sql).toContain("public.order_transition_internal(new.id,'order','confirmed'");
    expect(sql).toContain("'Aceite automático pela configuração da unidade'");
    expect(sql).toContain("public.order_transition_internal(new.id,'fulfillment','awaiting_assignment'");
    expect(sql).toContain("private.delivery_ensure(new.id,null)");
    expect(read("supabase/sql/53_delivery_operations.sql")).toContain("on conflict (order_id) do nothing");
  });

  it("keeps driver tracking explicit, scoped, rate-limited and retained", () => {
    for (const table of ["driver_route_sessions", "driver_route_deliveries", "driver_route_points", "driver_route_events"]) expect(sql).toContain(`public.${table}`);
    expect(sql).toContain("driver_route_sessions_one_active_per_driver");
    expect(sql).toContain("heartbeat rate limit exceeded");
    expect(sql).toContain("route session does not belong to current driver");
    expect(sql).toContain("cleanup_driver_route_points_internal");
    expect(read("src/app/api/internal/route-retention/route.ts")).toContain('authorizeInternalJob(request, "route_retention")');
    expect(sql).toContain("where s.status='active'");
    expect(hardeningSql).toContain("v_order.fulfillment_status<>'out_for_delivery'");
    expect(hardeningSql).toContain("route can only start after delivery is out for delivery");
  });

  it("separates marketing consent from transactional contact and revalidates opt-out", () => {
    expect(sql).toContain("customer_marketing_preferences");
    expect(sql).toContain("'not_consented','consented','opted_out'");
    expect(sql).toContain("Consentimento promocional ausente");
    expect(sql).toContain("Cliente solicitou opt-out");
    expect(sql).toContain("Cliente fora do escopo da unidade");
  });

  it("queues official WhatsApp templates with leases, retry and per-store throttle", () => {
    expect(sql).toContain("approved WhatsApp template is required");
    expect(sql).toContain("campaign_claim_internal");
    expect(sql).toContain("for update of cr skip locked");
    expect(sql).toContain("campaign_rate_per_minute");
    expect(sql).toContain("row_number() over(partition by cr.store_id");
    expect(sql).toContain("failed_transient");
    expect(sql).toContain("partially_failed");
    expect(hardeningSql).toContain("campaign_cancel_internal");
    expect(hardeningSql).toContain("growth.campaign_canceled");
    expect(concurrencySql).toContain("status in ('eligible','queued','failed_transient','pending')");
    expect(concurrencySql).toContain("c.status<>'canceled'");
    expect(providerStatusSql).toContain("campaign_update_delivery_internal");
    expect(providerStatusSql).toContain("campaign_recipients_provider_message_unique");
  });

  it("enforces module dependencies and audits platform changes", () => {
    expect(sql).toContain("simplified workflow requires auto accept");
    expect(sql).toContain("driver tracking requires deliveries and driver modules");
    expect(sql).toContain("campaigns require growth, customers and conversations modules");
    expect(sql).toContain("platform.store_operational_settings_updated");
    expect(sql).toContain("before_data,after_data,request_id");
  });
});

describe("client 01 product surfaces", () => {
  it("renders exactly three operational columns in simplified mode", () => {
    const board = read("src/features/orders/order-manager-board.tsx");
    expect(board).toContain('workflowMode === "simplified"');
    expect(board).toContain('{ key: "start", label: "Iniciar"');
    expect(board).toContain('{ key: "ready", label: "Pronto"');
    expect(board).toContain('{ key: "completed", label: "Finalizados"');
  });

  it("keeps the driver mobile portal minimal and location sharing transparent", () => {
    const page = read("src/app/(app)/entregador/page.tsx");
    const tracker = read("src/features/delivery/driver-location-tracker.tsx");
    expect(page).toContain("DriverLocationTracker");
    expect(tracker).toContain("Compartilhar localização da rota");
    expect(tracker).toContain("somente durante esta rota");
    expect(tracker).toContain("navigator.geolocation.watchPosition");
    expect(tracker).toContain("clearWatch");
  });

  it("provides owner route alerts without making maps a dependency", () => {
    const panel = read("src/features/delivery/route-tracking-panel.tsx");
    expect(panel).toContain("Sem atualização de localização");
    expect(panel).toContain("Possivelmente parado");
    expect(panel).toContain("A rota continua operacional sem mapa");
  });

  it("provides a dedicated campaign center and protected async worker", () => {
    const page = read("src/app/(app)/crescimento/campanhas/page.tsx");
    const route = read("src/app/api/internal/campaign-messages/route.ts");
    const worker = read("src/server/growth/campaign-worker.ts");
    expect(page).toContain("Todos os elegíveis");
    expect(page).toContain("Template aprovado da Meta");
    expect(page).toContain("includeCustomerNameParameter");
    expect(page).toContain("Cancelar campanha");
    expect(route).toContain('authorizeInternalJob(request, "campaign_messages")');
    expect(worker).toContain("WhatsAppCloudProvider");
    expect(worker).toContain('preference.data?.status !== "consented"');
    expect(worker).toContain("approvedParameters");
    expect(worker).toContain("Releitura imediatamente antes do provider");
    expect(worker).toContain("result[status] += 1");
    expect(read("src/server/conversations/conversation-service.ts")).toContain("campaign_update_delivery_internal");
  });

  it("runs recovery and retention independently of hosting cron secrets", () => {
    expect(schedulerSql).toContain("create extension if not exists pg_net");
    expect(schedulerSql).toContain("vault.create_secret");
    expect(schedulerSql).toContain("authorize_internal_job_internal");
    expect(schedulerSql).toContain("pedeaqui-campaign-message-recovery");
    expect(schedulerSql).toContain("*/5 * * * *");
    expect(schedulerSql).toContain("pedeaqui-route-retention");
    expect(read("vercel.json")).not.toContain('"crons"');
  });

  it("exposes auditable per-store controls only in the platform panel", () => {
    const form = read("src/features/platform/operational-settings-form.tsx");
    const action = read("src/features/platform/operational-settings-actions.ts");
    expect(form).toContain("Comportamento dos módulos");
    expect(form).toContain("Motivo da alteração");
    expect(form).toContain("Protocolo");
    expect(action).toContain("OperationalSettingsService.savePlatform");
  });
});
