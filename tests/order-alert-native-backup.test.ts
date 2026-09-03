import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const provider = read("src/features/orders/use-order-alert.tsx");
const presenceRoute = read("src/app/api/order-alert/presence/route.ts");
const agentRoute = read("src/app/api/print-agent/order-alerts/route.ts");
const backupService = read("src/server/orders/order-alert-backup-service.ts");
const agentIndex = read("print-agent/src/index.mjs");
const agentAlert = read("print-agent/src/order-alert.mjs");
const manifest = JSON.parse(read("print-agent/manifest.json")) as { version: string; files: string[] };
const presenceMigration = read("supabase/sql/146_order_alert_native_backup.sql");
const eventMigration = read("supabase/sql/147_order_alert_native_events.sql");

describe("optional native new-order alert backup", () => {
  it("keeps the web sound independent from native presence failures", () => {
    expect(provider).toContain('fetch("/api/order-alert/presence"');
    expect(provider).toContain(".catch(() => undefined)");
    expect(provider).toContain("playOrderAlertTone(audio)");
    expect(provider).toContain("writeOrderAlertPreference(true)");
    expect(provider).toContain("writeOrderAlertPreference(false)");
  });

  it("reports panel presence and the explicit sound preference", () => {
    expect(provider).toContain("presenceHeartbeatMs = 20_000");
    expect(provider).toContain("navigator.sendBeacon");
    expect(provider).toContain("configuredRef.current");
    expect(presenceRoute).toContain("PERMISSIONS.ORDERS_VIEW");
    expect(presenceRoute).toContain("soundEnabled");
    expect(backupService).toContain("sound_enabled: soundEnabled");
  });

  it("uses service-role-only alert tables with RLS", () => {
    expect(presenceMigration).toContain("create table if not exists public.order_alert_panel_presence");
    expect(presenceMigration).toContain("enable row level security");
    expect(presenceMigration).toContain("revoke all on table public.order_alert_panel_presence from public, anon, authenticated");
    expect(presenceMigration).toContain("sound_enabled boolean not null default false");
    expect(presenceMigration).toContain("is_active boolean not null default true");
    expect(eventMigration).toContain("create table if not exists public.order_alert_events");
    expect(eventMigration).toContain("revoke all on table public.order_alert_events from public, anon, authenticated");
  });

  it("captures arrival as an immutable event so fast status changes do not lose the alert", () => {
    expect(eventMigration).toContain("private.capture_order_alert_event()");
    expect(eventMigration).toContain("security definer");
    expect(eventMigration).toContain("if new.order_status = 'pending_confirmation'");
    expect(eventMigration).toContain("after insert on public.orders");
    expect(backupService).toContain('.from("order_alert_events")');
    expect(backupService).toContain('.gt("id", safeCursor)');
    expect(backupService).not.toContain('.eq("order_status", "pending_confirmation")');
  });

  it("lets the authenticated Print Agent poll without exposing the endpoint publicly", () => {
    expect(agentRoute).toContain("authenticatePrintAgentRequest(request)");
    expect(agentRoute).toContain('{ error: "unauthorized" }');
    expect(agentRoute).toContain("/^\\d+$/");
    expect(backupService).toContain("panelActive");
    expect(backupService).toContain("nativeEnabled");
    expect(backupService).toContain("baselineCursor");
  });

  it("plays the same PedeAqui MP3 on Windows only when the web panel is not active", () => {
    expect(existsSync("print-agent/src/order-alert.mjs")).toBe(true);
    expect(agentAlert).toContain("pedeaqui-pedido.mp3");
    expect(agentAlert).toContain("process.platform === \"win32\"");
    expect(agentAlert).toContain("!result?.nativeEnabled || result?.panelActive || orders.length === 0");
    expect(agentAlert).toContain("SystemSounds]::Exclamation.Play()");
    expect(agentIndex).toContain("pollNativeOrderAlerts({ apiUrl, post })");
    expect(agentIndex).toContain("nativeOrderAlerts: nativeOrderAlertSupported()");
  });

  it("ships the backup through the existing self-updater without a second installer", () => {
    expect(manifest.version).toBe("0.7.0");
    expect(manifest.files).toContain("src/order-alert.mjs");
    expect(read("print-agent/package.json")).toContain('"version": "0.7.0"');
    expect(agentIndex).toContain('const version = "0.7.0"');
  });
});
