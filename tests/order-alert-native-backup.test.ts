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
const migration = read("supabase/sql/146_order_alert_native_backup.sql");

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

  it("uses a service-role-only presence table with RLS", () => {
    expect(migration).toContain("create table if not exists public.order_alert_panel_presence");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.order_alert_panel_presence from public, anon, authenticated");
    expect(migration).toContain("sound_enabled boolean not null default false");
    expect(migration).toContain("is_active boolean not null default true");
  });

  it("lets the authenticated Print Agent poll without exposing the endpoint publicly", () => {
    expect(agentRoute).toContain("authenticatePrintAgentRequest(request)");
    expect(agentRoute).toContain('{ error: "unauthorized" }');
    expect(backupService).toContain("panelActive");
    expect(backupService).toContain("nativeEnabled");
    expect(backupService).toContain('.eq("order_status", "pending_confirmation")');
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
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.files).toContain("src/order-alert.mjs");
    expect(read("print-agent/package.json")).toContain('"version": "0.5.0"');
    expect(agentIndex).toContain('const version = "0.5.0"');
  });
});
