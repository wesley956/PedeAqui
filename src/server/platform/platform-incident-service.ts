import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

const lifecycleSchema = z.object({
  fingerprint: z.string().min(16).max(64),
  status: z.enum(["open", "investigating", "resolved"]),
  severity: z.enum(["P0", "P1", "P2", "P3"]),
  category: z.string().min(2).max(40),
  title: z.string().min(3).max(160),
  summary: z.string().min(3).max(500),
  sourceKind: z.string().min(2).max(80),
  sourceReference: z.string().max(160).nullable(),
  organizationId: z.string().uuid().nullable(),
  storeId: z.string().uuid().nullable(),
  occurrenceCount: z.coerce.number().int().positive().max(1000000),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  note: z.string().trim().min(3).max(1000),
});

const secretKey = /token|secret|password|authorization|cookie|phone|email|address|payload|document|content/i;
const secretValue = /bearer\s+\S+|eyJ[a-zA-Z0-9_-]{20,}|[a-zA-Z0-9_-]{40,}/gi;

function cleanText(value: unknown, max = 320) {
  if (typeof value !== "string") return "Falha registrada sem detalhe público.";
  return value.replace(secretValue, "[protegido]").replace(/\s+/g, " ").trim().slice(0, max) || "Falha registrada sem detalhe público.";
}

function safeObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(safeObject);
  if (!value || typeof value !== "object") return typeof value === "string" ? cleanText(value, 180) : value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    output[key] = secretKey.test(key) ? "[protegido]" : safeObject(item);
  }
  return output;
}

function fingerprint(parts: Array<string | null | undefined>) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex");
}

function severityFor(kind: string, attempts = 1) {
  if (kind === "billing" && attempts >= 3) return "P1" as const;
  if (kind === "integration" && attempts >= 3) return "P1" as const;
  if (kind === "printing" && attempts >= 3) return "P2" as const;
  if (kind === "fiscal" && attempts >= 3) return "P2" as const;
  return "P3" as const;
}

type Signal = {
  fingerprint: string;
  severity: "P0" | "P1" | "P2" | "P3";
  category: string;
  title: string;
  summary: string;
  organizationId: string | null;
  storeId: string | null;
  sourceKind: string;
  sourceReference: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

export class PlatformIncidentService {
  static async load() {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const [orgs, stores, persisted, events, printJobs, fiscalJobs, integrations, billing, audits] = await Promise.all([
      admin.from("organizations").select("id,name"),
      admin.from("stores").select("id,organization_id,name"),
      admin.from("platform_incidents").select("*").order("last_seen_at", { ascending: false }).limit(300),
      admin.from("domain_events").select("id,organization_id,store_id,event_type,status,attempts,error_message,created_at,occurred_at").eq("status", "failed").order("created_at", { ascending: false }).limit(200),
      admin.from("print_jobs").select("id,organization_id,store_id,status,attempts,last_error,created_at,updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(200),
      admin.from("fiscal_jobs").select("id,organization_id,store_id,status,attempts,last_error,created_at,updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(200),
      admin.from("integration_webhook_deliveries").select("id,organization_id,store_id,event_type,status,attempts,last_error,created_at,updated_at").eq("status", "failed").order("updated_at", { ascending: false }).limit(200),
      admin.from("billing_webhook_receipts").select("id,provider_key,status,error_message,created_at,updated_at").in("status", ["failed", "error", "rejected"]).order("updated_at", { ascending: false }).limit(200),
      admin.from("audit_logs").select("id,organization_id,store_id,actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id,created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    for (const result of [orgs, stores, persisted, events, printJobs, fiscalJobs, integrations, billing, audits]) if (result.error) throw result.error;

    const orgById = new Map((orgs.data ?? []).map((item) => [item.id, item.name]));
    const storeById = new Map((stores.data ?? []).map((item) => [item.id, item.name]));
    const groups = new Map<string, Signal>();

    const add = (signal: Omit<Signal, "occurrenceCount" | "firstSeenAt"> & { seenAt: string }) => {
      const current = groups.get(signal.fingerprint);
      if (current) {
        current.occurrenceCount += 1;
        if (signal.seenAt < current.firstSeenAt) current.firstSeenAt = signal.seenAt;
        if (signal.seenAt > current.lastSeenAt) current.lastSeenAt = signal.seenAt;
        return;
      }
      groups.set(signal.fingerprint, { ...signal, firstSeenAt: signal.seenAt, lastSeenAt: signal.seenAt, occurrenceCount: 1 });
    };

    for (const row of events.data ?? []) add({
      fingerprint: fingerprint(["domain", row.organization_id, row.store_id, row.event_type, cleanText(row.error_message, 100)]),
      severity: severityFor("domain", row.attempts), category: "Operação", title: `Evento ${row.event_type} com falha`,
      summary: cleanText(row.error_message), organizationId: row.organization_id, storeId: row.store_id,
      sourceKind: "domain_event", sourceReference: row.id, seenAt: row.occurred_at ?? row.created_at, lastSeenAt: row.occurred_at ?? row.created_at,
    });
    for (const row of printJobs.data ?? []) add({
      fingerprint: fingerprint(["printing", row.organization_id, row.store_id, cleanText(row.last_error, 100)]),
      severity: severityFor("printing", row.attempts), category: "Impressão", title: "Falha recorrente de impressão",
      summary: cleanText(row.last_error), organizationId: row.organization_id, storeId: row.store_id,
      sourceKind: "print_job", sourceReference: row.id, seenAt: row.updated_at ?? row.created_at, lastSeenAt: row.updated_at ?? row.created_at,
    });
    for (const row of fiscalJobs.data ?? []) add({
      fingerprint: fingerprint(["fiscal", row.organization_id, row.store_id, cleanText(row.last_error, 100)]),
      severity: severityFor("fiscal", row.attempts), category: "Fiscal", title: "Processamento fiscal com falha",
      summary: cleanText(row.last_error), organizationId: row.organization_id, storeId: row.store_id,
      sourceKind: "fiscal_job", sourceReference: row.id, seenAt: row.updated_at ?? row.created_at, lastSeenAt: row.updated_at ?? row.created_at,
    });
    for (const row of integrations.data ?? []) add({
      fingerprint: fingerprint(["integration", row.organization_id, row.store_id, row.event_type, cleanText(row.last_error, 100)]),
      severity: severityFor("integration", row.attempts), category: "Integração", title: `Webhook ${row.event_type} com falha`,
      summary: cleanText(row.last_error), organizationId: row.organization_id, storeId: row.store_id,
      sourceKind: "integration_webhook", sourceReference: row.id, seenAt: row.updated_at ?? row.created_at, lastSeenAt: row.updated_at ?? row.created_at,
    });
    for (const row of billing.data ?? []) add({
      fingerprint: fingerprint(["billing", row.provider_key, cleanText(row.error_message, 100)]),
      severity: severityFor("billing", 3), category: "Cobrança", title: `Cobrança PedeAqui com falha (${row.provider_key})`,
      summary: cleanText(row.error_message), organizationId: null, storeId: null,
      sourceKind: "billing_webhook", sourceReference: row.id, seenAt: row.updated_at ?? row.created_at, lastSeenAt: row.updated_at ?? row.created_at,
    });

    const persistedByFingerprint = new Map((persisted.data ?? []).map((item) => [item.fingerprint, item]));
    const incidents = [...groups.values()].map((signal) => {
      const saved = persistedByFingerprint.get(signal.fingerprint);
      const reopened = saved?.resolved_at && signal.lastSeenAt > saved.resolved_at;
      return {
        ...signal,
        status: reopened ? "open" : (saved?.status ?? "open"),
        severity: saved?.severity ?? signal.severity,
        internalNote: saved?.internal_note ? cleanText(saved.internal_note, 500) : null,
        organizationName: signal.organizationId ? (orgById.get(signal.organizationId) ?? "Empresa indisponível") : "Plataforma",
        storeName: signal.storeId ? (storeById.get(signal.storeId) ?? "Unidade indisponível") : null,
      };
    });

    for (const saved of persisted.data ?? []) if (!groups.has(saved.fingerprint)) incidents.push({
      fingerprint: saved.fingerprint, severity: saved.severity, category: saved.category, title: saved.title,
      summary: cleanText(saved.summary), organizationId: saved.organization_id, storeId: saved.store_id,
      sourceKind: saved.source_kind, sourceReference: saved.source_reference, firstSeenAt: saved.first_seen_at,
      lastSeenAt: saved.last_seen_at, occurrenceCount: saved.occurrence_count, status: saved.status,
      internalNote: saved.internal_note ? cleanText(saved.internal_note, 500) : null,
      organizationName: saved.organization_id ? (orgById.get(saved.organization_id) ?? "Empresa indisponível") : "Plataforma",
      storeName: saved.store_id ? (storeById.get(saved.store_id) ?? "Unidade indisponível") : null,
    });

    incidents.sort((a, b) => (a.status === "resolved" ? 1 : -1) - (b.status === "resolved" ? 1 : -1) || b.lastSeenAt.localeCompare(a.lastSeenAt));

    const auditRows = (audits.data ?? []).map((row) => ({
      id: row.id,
      organizationName: orgById.get(row.organization_id) ?? "Empresa indisponível",
      storeName: row.store_id ? (storeById.get(row.store_id) ?? "Unidade indisponível") : null,
      action: row.action,
      entityType: row.entity_type,
      requestId: row.request_id,
      before: safeObject(row.before_data),
      after: safeObject(row.after_data),
      createdAt: row.created_at,
    }));

    return {
      incidents,
      auditRows,
      totals: {
        open: incidents.filter((item) => item.status === "open").length,
        investigating: incidents.filter((item) => item.status === "investigating").length,
        p0p1: incidents.filter((item) => item.status !== "resolved" && ["P0", "P1"].includes(item.severity)).length,
        resolved: incidents.filter((item) => item.status === "resolved").length,
      },
    };
  }

  static async setLifecycle(input: z.input<typeof lifecycleSchema>) {
    const values = lifecycleSchema.parse(input);
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    if (values.organizationId) {
      const { data: org } = await admin.from("organizations").select("id").eq("id", values.organizationId).single();
      if (!org) throw new Error("Empresa do incidente não existe.");
    }
    if (values.storeId) {
      const query = admin.from("stores").select("id,organization_id").eq("id", values.storeId);
      const { data: store } = values.organizationId ? await query.eq("organization_id", values.organizationId).single() : await query.single();
      if (!store) throw new Error("Unidade do incidente não pertence ao contexto informado.");
    }
    const now = new Date().toISOString();
    const payload = {
      fingerprint: values.fingerprint, severity: values.severity, status: values.status, category: values.category,
      title: cleanText(values.title, 160), summary: cleanText(values.summary, 500), organization_id: values.organizationId,
      store_id: values.storeId, source_kind: values.sourceKind, source_reference: values.sourceReference,
      occurrence_count: values.occurrenceCount, first_seen_at: values.firstSeenAt, last_seen_at: values.lastSeenAt,
      internal_note: cleanText(values.note, 1000), updated_by: access.user.id,
      resolved_at: values.status === "resolved" ? now : null, updated_at: now,
    };
    const { data: before } = await admin.from("platform_incidents").select("id,status,severity,internal_note").eq("fingerprint", values.fingerprint).maybeSingle();
    const { data, error } = await admin.from("platform_incidents").upsert(payload, { onConflict: "fingerprint" }).select("id").single();
    if (error) throw error;
    if (values.organizationId) {
      const { error: auditError } = await admin.from("audit_logs").insert({
        organization_id: values.organizationId, store_id: values.storeId, actor_user_id: access.user.id,
        action: `platform.incident.${values.status}`, entity_type: "platform_incident", entity_id: data.id,
        before_data: before ? safeObject(before) : null,
        after_data: { status: values.status, severity: values.severity, note: cleanText(values.note, 300) },
        request_id: `incident:${values.fingerprint.slice(0, 12)}`,
      });
      if (auditError) throw auditError;
    }
    return { id: data.id };
  }
}
