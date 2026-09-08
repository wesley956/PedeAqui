import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import type { ExternalCapabilityKey, IntegrationProvider } from "@/server/integrations/core/capabilities";
import {
  classifyOmnichannelFailure,
  humanCapabilityImpact,
  incidentCandidatesForCapability,
  resolveCapabilityHealthState,
  secondsBetween,
  secondsSince,
  type OmnichannelCapabilityHealth,
  type OmnichannelQueueMetrics,
} from "@/server/integrations/observability/omnichannel-health-model";

const CAPABILITIES: Record<IntegrationProvider, readonly ExternalCapabilityKey[]> = {
  ifood: ["ifood_orders", "ifood_catalog", "ifood_shipping"],
  "99food": ["99food_orders", "99food_menu", "99food_logistics"],
  "99entrega": ["99entrega"],
};

type EventRow = {
  id: string; organization_id: string; store_id: string; integration_account_id: string;
  provider: IntegrationProvider; capability: string; status: string; received_at: string;
  processed_at: string | null; last_error_kind: string | null; last_error: string | null; attempts: number;
};
type OutboxRow = {
  id: string; organization_id: string; store_id: string; integration_account_id: string;
  provider: IntegrationProvider; capability: string; status: string; created_at: string;
  sent_at: string | null; confirmed_at: string | null; last_error_kind: string | null; last_error: string | null; attempts: number;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function latest<T>(rows: T[], timestamp: (row: T) => string | null): T | null {
  return [...rows].sort((a, b) => String(timestamp(b) ?? "").localeCompare(String(timestamp(a) ?? "")))[0] ?? null;
}

function queueMetrics<T extends { status: string; last_error_kind: string | null; last_error: string | null }>(
  rows: T[],
  openedAt: (row: T) => string,
  successAt: (row: T) => string | null,
): OmnichannelQueueMetrics {
  const open = rows.filter((row) => row.status === "pending" || row.status === "processing" || row.status === "retry" || row.status === "dead_letter");
  const failures = rows.filter((row) => row.last_error_kind || row.last_error);
  const lastFailure = latest(failures, openedAt);
  const successes = rows.filter((row) => Boolean(successAt(row)));
  return {
    pending: rows.filter((row) => row.status === "pending").length,
    retry: rows.filter((row) => row.status === "retry").length,
    processing: rows.filter((row) => row.status === "processing").length,
    deadLetter: rows.filter((row) => row.status === "dead_letter").length,
    oldestOpenAt: open.map(openedAt).sort()[0] ?? null,
    lastSuccessAt: successes.map(successAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    lastFailureKind: lastFailure?.last_error_kind ?? null,
    lastFailure: lastFailure?.last_error ?? null,
  };
}

async function collectHealth(): Promise<{
  items: Array<OmnichannelCapabilityHealth & { organizationName: string; storeName: string }>;
}> {
  const admin = createAdminClient();
  const [accounts, merchants, organizations, stores, events, outbox, externalOrders] = await Promise.all([
    admin.from("integration_accounts").select("id,organization_id,provider,status,environment,connection_state,last_health_at,last_health_error_code"),
    admin.from("integration_merchants").select("id,organization_id,store_id,integration_account_id,provider,capabilities"),
    admin.from("organizations").select("id,name"),
    admin.from("stores").select("id,organization_id,name"),
    admin.from("integration_events").select("id,organization_id,store_id,integration_account_id,provider,capability,status,received_at,processed_at,last_error_kind,last_error,attempts").order("received_at", { ascending: false }).limit(3000),
    admin.from("integration_outbox").select("id,organization_id,store_id,integration_account_id,provider,capability,status,created_at,sent_at,confirmed_at,last_error_kind,last_error,attempts").order("created_at", { ascending: false }).limit(3000),
    admin.from("external_orders").select("id,organization_id,store_id,integration_account_id,provider,sync_status,updated_at").in("sync_status", ["retry", "attention"]).limit(1000),
  ]);
  for (const result of [accounts, merchants, organizations, stores, events, outbox, externalOrders]) if (result.error) throw result.error;

  const orgName = new Map((organizations.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const storeName = new Map((stores.data ?? []).map((row) => [String(row.id), String(row.name)]));
  const eventRows = (events.data ?? []) as EventRow[];
  const outboxRows = (outbox.data ?? []) as OutboxRow[];
  const items: Array<OmnichannelCapabilityHealth & { organizationName: string; storeName: string }> = [];

  for (const merchant of merchants.data ?? []) {
    const provider = merchant.provider as IntegrationProvider;
    const account = (accounts.data ?? []).find((row) => row.id === merchant.integration_account_id);
    if (!account || !CAPABILITIES[provider]) continue;
    const rawCapabilities = object(merchant.capabilities);
    for (const capability of CAPABILITIES[provider]) {
      const enabled = rawCapabilities[capability] === true;
      const eventSet = eventRows.filter((row) => row.integration_account_id === account.id && row.store_id === merchant.store_id && row.capability === capability);
      const outboxSet = outboxRows.filter((row) => row.integration_account_id === account.id && row.store_id === merchant.store_id && row.capability === capability);
      const inbox = queueMetrics(eventSet, (row) => row.received_at, (row) => row.processed_at);
      const outbound = queueMetrics(outboxSet, (row) => row.created_at, (row) => row.confirmed_at ?? row.sent_at);
      const latestEvent = latest(eventSet, (row) => row.received_at);
      const latestOutbox = latest(outboxSet, (row) => row.created_at);
      const failureKind = classifyOmnichannelFailure({
        connectionState: typeof account.connection_state === "string" ? account.connection_state : null,
        accountStatus: typeof account.status === "string" ? account.status : null,
        lastErrorKind: latestEvent?.last_error_kind ?? latestOutbox?.last_error_kind ?? (typeof account.last_health_error_code === "string" ? account.last_health_error_code : null),
        lastError: latestEvent?.last_error ?? latestOutbox?.last_error ?? null,
      });
      const divergenceCount = capability.endsWith("orders")
        ? (externalOrders.data ?? []).filter((row) => row.integration_account_id === account.id && row.store_id === merchant.store_id && row.provider === provider).length
        : 0;
      const state = resolveCapabilityHealthState({
        enabled,
        accountStatus: typeof account.status === "string" ? account.status : "disconnected",
        connectionState: typeof account.connection_state === "string" ? account.connection_state : "not_connected",
        failureKind,
        inbox,
        outbox: outbound,
        divergenceCount,
      });
      const lastEventReceivedAt = eventSet.map((row) => row.received_at).sort().at(-1) ?? null;
      const lastEventProcessedAt = eventSet.map((row) => row.processed_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
      const item: OmnichannelCapabilityHealth & { organizationName: string; storeName: string } = {
        key: `${provider}:${account.id}:${merchant.store_id}:${capability}`,
        provider,
        capability,
        organizationId: String(merchant.organization_id),
        organizationName: orgName.get(String(merchant.organization_id)) ?? "Empresa",
        storeId: String(merchant.store_id),
        storeName: storeName.get(String(merchant.store_id)) ?? "Unidade",
        integrationAccountId: String(account.id),
        enabled,
        environment: account.environment === "production" ? "production" : "sandbox",
        connectionState: typeof account.connection_state === "string" ? account.connection_state : "not_connected",
        state,
        failureKind,
        impact: "",
        lastHealthAt: typeof account.last_health_at === "string" ? account.last_health_at : null,
        lastEventReceivedAt,
        lastEventProcessedAt,
        ingestionLagSeconds: lastEventReceivedAt
          ? (lastEventProcessedAt ? secondsBetween(lastEventReceivedAt, lastEventProcessedAt) : secondsSince(lastEventReceivedAt))
          : null,
        inbox,
        outbox: outbound,
        divergenceCount,
      };
      item.impact = humanCapabilityImpact(item);
      items.push(item);
    }
  }

  return { items };
}

export class PlatformOmnichannelHealthService {
  static async load() {
    await PlatformAdminService.access();
    const data = await collectHealth();
    return {
      ...data,
      totals: {
        enabled: data.items.filter((item) => item.enabled).length,
        healthy: data.items.filter((item) => item.enabled && item.state === "connected").length,
        attention: data.items.filter((item) => item.enabled && item.state !== "connected").length,
        deadLetters: data.items.reduce((sum, item) => sum + item.inbox.deadLetter + item.outbox.deadLetter, 0),
        divergences: data.items.reduce((sum, item) => sum + item.divergenceCount, 0),
      },
    };
  }

  static async syncIncidents(): Promise<{ openedOrUpdated: number; recovered: number }> {
    const admin = createAdminClient();
    const { items } = await collectHealth();
    const candidates = items.flatMap((item) => incidentCandidatesForCapability(item));
    const activeFingerprints = new Set(candidates.map((candidate) => candidate.fingerprint));
    const existing = await admin
      .from("platform_incidents")
      .select("id,fingerprint,status,occurrence_count")
      .eq("category", "omnichannel")
      .neq("status", "resolved");
    if (existing.error) throw existing.error;
    const existingByFingerprint = new Map((existing.data ?? []).map((row) => [String(row.fingerprint), row]));
    const now = new Date().toISOString();
    let openedOrUpdated = 0;
    let recovered = 0;

    for (const candidate of candidates) {
      const current = existingByFingerprint.get(candidate.fingerprint);
      if (current) {
        const update = await admin.from("platform_incidents").update({
          severity: candidate.severity,
          status: "open",
          title: candidate.title,
          summary: candidate.summary,
          source_kind: candidate.sourceKind,
          source_reference: candidate.sourceReference,
          occurrence_count: Number(current.occurrence_count ?? 0) + 1,
          last_seen_at: now,
          resolved_at: null,
          updated_at: now,
        }).eq("id", current.id);
        if (update.error) throw update.error;
      } else {
        const insert = await admin.from("platform_incidents").insert({
          fingerprint: candidate.fingerprint,
          severity: candidate.severity,
          status: "open",
          category: "omnichannel",
          title: candidate.title,
          summary: candidate.summary,
          organization_id: candidate.organizationId,
          store_id: candidate.storeId,
          source_kind: candidate.sourceKind,
          source_reference: candidate.sourceReference,
          occurrence_count: 1,
          first_seen_at: now,
          last_seen_at: now,
        });
        if (insert.error) throw insert.error;
      }
      openedOrUpdated += 1;
    }

    for (const current of existing.data ?? []) {
      if (activeFingerprints.has(String(current.fingerprint))) continue;
      const update = await admin.from("platform_incidents").update({ status: "resolved", resolved_at: now, last_seen_at: now, updated_at: now }).eq("id", current.id);
      if (update.error) throw update.error;
      recovered += 1;
    }
    return { openedOrUpdated, recovered };
  }
}
