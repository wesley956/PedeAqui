import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyWhatsAppOperationalHealth,
  WHATSAPP_OPERATIONAL_RECENT_FAILURE_MS,
} from "@/server/conversations/whatsapp-operational-health-model";

const read = (path: string) => readFileSync(path, "utf8");
const service = read("src/server/conversations/whatsapp-operational-health-service.ts");
const page = read("src/app/(app)/configuracoes/conversas/page.tsx");
const runbook = read("docs/WHATSAPP_SUPPORT_PLAYBOOK.md");

const base = {
  enabled: true,
  connectionStatus: "connected",
  onboardingStatus: "completed",
  connectionMode: "cloud_api",
  subscriptionStatus: null,
  appWebhookStatus: null,
  lastIngestErrorAt: null,
  lastIngestErrorKind: null,
  lastHistoryErrorKind: null,
  lastStateSyncErrorKind: null,
  outboundPending: 0,
  outboundFailedRecent: 0,
  mediaPending: 0,
  mediaFailedRecent: 0,
};

describe("WPP-13 operational WhatsApp health", () => {
  it("keeps a connected Cloud API channel healthy without requiring coexistence telemetry", () => {
    expect(classifyWhatsAppOperationalHealth(base)).toEqual({
      state: "healthy",
      issues: [],
    });
  });

  it("does not treat lack of recent traffic as a webhook failure", () => {
    const result = classifyWhatsAppOperationalHealth({
      ...base,
      connectionMode: "coexistence",
      subscriptionStatus: "subscribed",
      appWebhookStatus: "subscribed",
    });
    expect(result).toEqual({ state: "healthy", issues: [] });
  });

  it("prioritizes disconnected, provider unavailable and action-required states", () => {
    expect(classifyWhatsAppOperationalHealth({ ...base, enabled: false }).state).toBe("disconnected");
    expect(classifyWhatsAppOperationalHealth({ ...base, connectionStatus: "temporarily_unavailable" }).state).toBe("provider_unavailable");

    const action = classifyWhatsAppOperationalHealth({
      ...base,
      connectionMode: "coexistence",
      subscriptionStatus: "not_subscribed",
      appWebhookStatus: "subscribed",
    });
    expect(action.state).toBe("action_required");
    expect(action.issues).toContain("waba_subscription_not_confirmed");
  });

  it("classifies queue and recent processing failures as attention", () => {
    const result = classifyWhatsAppOperationalHealth({
      ...base,
      outboundPending: 2,
      outboundFailedRecent: 1,
      mediaPending: 3,
      mediaFailedRecent: 1,
    });
    expect(result.state).toBe("attention");
    expect(result.issues).toEqual(expect.arrayContaining([
      "outbound_pending",
      "outbound_failed_recent",
      "media_processing_backlog",
      "media_failed_recent",
    ]));
  });

  it("only treats ingestion failure as recent inside the explicit 24h window", () => {
    expect(WHATSAPP_OPERATIONAL_RECENT_FAILURE_MS).toBe(86_400_000);
    const now = new Date("2026-09-17T20:00:00.000Z");

    const recent = classifyWhatsAppOperationalHealth({
      ...base,
      lastIngestErrorKind: "signature_invalid",
      lastIngestErrorAt: "2026-09-17T19:00:00.000Z",
    }, now);
    expect(recent.issues).toContain("ingest_failure_recent");

    const old = classifyWhatsAppOperationalHealth({
      ...base,
      lastIngestErrorKind: "signature_invalid",
      lastIngestErrorAt: "2026-09-15T19:00:00.000Z",
    }, now);
    expect(old.issues).not.toContain("ingest_failure_recent");
    expect(old.state).toBe("healthy");
  });

  it("surfaces history and state-sync errors without payloads", () => {
    const result = classifyWhatsAppOperationalHealth({
      ...base,
      lastHistoryErrorKind: "provider_123",
      lastStateSyncErrorKind: "parse_failed",
    });
    expect(result.state).toBe("attention");
    expect(result.issues).toEqual(expect.arrayContaining(["history_sync_error", "state_sync_error"]));
  });

  it("requires integrations.manage and scopes every operational source to organization/store", () => {
    expect(service).toContain("authorize(PERMISSIONS.INTEGRATIONS_MANAGE)");
    expect(service).toContain('const storeId = requireStoreId(context.storeId)');
    for (const table of [
      'from("store_conversation_settings")',
      'from("whatsapp_coexistence_observability")',
      'from("messages")',
      'from("message_media")',
      'from("conversations")',
    ]) {
      expect(service).toContain(table);
    }
    expect((service.match(/\.eq\("organization_id", context\.organizationId\)/g) ?? []).length).toBeGreaterThanOrEqual(9);
    expect((service.match(/\.eq\("store_id", storeId\)/g) ?? []).length).toBeGreaterThanOrEqual(9);
  });

  it("never selects message bodies, customer phone, address or provider credentials", () => {
    expect(service).not.toContain('.select("body');
    expect(service).not.toContain("phone_normalized");
    expect(service).not.toContain("customer_addresses");
    expect(service).not.toContain("access_token_secret_ref");
    expect(service).not.toContain("app_secret_secret_ref");
    expect(service).not.toContain("whatsapp_phone_number_id");
    expect(service).not.toContain("whatsapp_business_account_id");
  });

  it("excludes unrecoverable legacy media from recent operational failures", () => {
    expect(service).toContain('row.failure_kind !== "legacy_media_unavailable"');
  });

  it("renders a compact health card and documents no-PII support rules", () => {
    expect(page).toContain("Saúde do WhatsApp");
    expect(page).toContain("Filas e atendimento");
    expect(page).toContain("Este diagnóstico não mostra mensagens, telefones, endereços, tokens");
    expect(runbook).toContain("Não interpretar ausência de tráfego recente como falha de webhook.");
    expect(runbook).toContain("WPP-10 — mídia");
    expect(runbook).toContain("WPP-11 — janela Meta e templates");
    expect(runbook).toContain("WPP-12 — permissões");
  });

  it("does not add a WPP-13 migration", () => {
    const migrations = readdirSync("supabase/migrations");
    expect(migrations.some((name) => name.toLowerCase().includes("wpp13"))).toBe(false);
  });
});
