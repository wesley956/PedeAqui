import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { hashPrintAgentToken } from "@/server/printing/agent-token";
import { renderPrintDocument, resolveOrderPrintPreferences, type PrintDocumentType } from "@/server/printing/templates";

const uuid = z.string().uuid();
const heartbeatSchema = z.object({
  version: z.string().trim().max(80).nullable().optional(),
  capabilities: z.record(z.string(), z.unknown()).default({}),
  printers: z.array(z.object({
    id: z.string().uuid(),
    status: z.enum(["unknown", "online", "offline", "degraded"]),
    error: z.string().max(2000).nullable().optional(),
  })).max(100).default([]),
});

type AuthenticatedAgent = {
  id: string;
  organization_id: string;
  store_id: string;
  name: string;
};

export class PrintQueueService {
  static async authenticateAgent(rawToken: string): Promise<AuthenticatedAgent | null> {
    if (rawToken.length < 20 || rawToken.length > 200) return null;
    const admin = createAdminClient();
    const { data, error } = await admin.from("print_agents")
      .select("id, organization_id, store_id, name")
      .eq("token_hash", hashPrintAgentToken(rawToken))
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  static async claim(agent: AuthenticatedAgent, limit = 5) {
    const safeLimit = z.number().int().min(1).max(20).parse(limit);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("print_agent_claim_internal", { p_agent_id: agent.id, p_limit: safeLimit });
    if (error) throw error;
    const jobs = Array.isArray(data) ? data : [];
    if (jobs.length === 0) return [];

    const printerIds = [...new Set(jobs.map((job) => String(job.printer_id)))];
    const [{ data: printers, error: printerError }, { data: preferences, error: preferencesError }] = await Promise.all([
      admin.from("printers")
        .select("id, name, connection_type, connection_address, connection_port, paper_width_mm")
        .eq("organization_id", agent.organization_id)
        .eq("store_id", agent.store_id)
        .in("id", printerIds),
      admin.from("store_print_preferences")
        .select("show_customer_name, show_customer_phone, show_delivery_address, show_item_modifiers, show_item_notes, show_prices, show_payment, show_footer, footer_text")
        .eq("organization_id", agent.organization_id)
        .eq("store_id", agent.store_id)
        .maybeSingle(),
    ]);
    if (printerError) throw printerError;
    if (preferencesError) throw preferencesError;
    const printPreferences = resolveOrderPrintPreferences(preferences);
    const byId = new Map((printers ?? []).map((printer) => [printer.id, printer]));

    const ready = [];
    for (const job of jobs) {
      const printer = byId.get(String(job.printer_id));
      if (!printer) {
        await admin.rpc("print_agent_fail_internal", { p_agent_id: agent.id, p_job_id: job.id, p_error: "printer configuration unavailable" });
        continue;
      }
      try {
        const rendered = job.rendered_content || renderPrintDocument(
          job.payload,
          String(job.document_type) as PrintDocumentType,
          Number(printer.paper_width_mm),
          Boolean(job.is_reprint),
          printPreferences,
        );
        if (!job.rendered_content) {
          const { error: updateError } = await admin.from("print_jobs")
            .update({ rendered_content: rendered, updated_at: new Date().toISOString() })
            .eq("id", job.id).eq("claimed_by_agent_id", agent.id).eq("status", "processing");
          if (updateError) throw updateError;
        }
        ready.push({
          id: job.id,
          copies: Number(job.copies),
          documentType: String(job.document_type),
          renderedContent: rendered,
          printer: {
            id: printer.id,
            name: printer.name,
            connectionType: printer.connection_type,
            address: printer.connection_address,
            port: printer.connection_port,
            paperWidthMm: Number(printer.paper_width_mm),
          },
        });
      } catch (renderError) {
        const message = renderError instanceof Error ? renderError.message : "render failed";
        await admin.rpc("print_agent_fail_internal", { p_agent_id: agent.id, p_job_id: job.id, p_error: message.slice(0, 2000) });
      }
    }
    return ready;
  }

  static async acknowledge(agent: AuthenticatedAgent, jobId: string) {
    const admin = createAdminClient();
    const { error } = await admin.rpc("print_agent_ack_internal", { p_agent_id: agent.id, p_job_id: uuid.parse(jobId) });
    if (error) throw error;
  }

  static async fail(agent: AuthenticatedAgent, jobId: string, message: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("print_agent_fail_internal", {
      p_agent_id: agent.id,
      p_job_id: uuid.parse(jobId),
      p_error: z.string().trim().min(1).max(2000).parse(message),
    });
    if (error) throw error;
    return data;
  }

  static async heartbeat(agent: AuthenticatedAgent, input: unknown) {
    const values = heartbeatSchema.parse(input);
    const admin = createAdminClient();
    const { error } = await admin.rpc("print_agent_heartbeat_internal", {
      p_agent_id: agent.id,
      p_version: values.version ?? null,
      p_capabilities: values.capabilities,
      p_printers: values.printers,
    });
    if (error) throw error;
  }

  static async listCurrent(limit = 100) {
    const context = await authorize(PERMISSIONS.PRINTING_VIEW);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const { data, error } = await admin.from("print_jobs")
      .select("id, order_id, station_id, printer_id, document_type, status, attempts, max_attempts, copies, available_at, processing_at, printed_at, failed_at, last_error, is_reprint, reprint_reason, created_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 250));
    if (error) throw error;
    return { context, jobs: data ?? [] };
  }

  static async enqueueSetupTest(printerId: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const storeId = context.storeId;
    const admin = createAdminClient();
    const id = uuid.parse(printerId);
    const { data: printer, error: printerError } = await admin.from("printers")
      .select("id, name, active, agent_id")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (printerError) throw printerError;
    if (!printer?.active || !printer.agent_id) throw new Error("A impressora precisa estar ativa e conectada a um computador");

    const { data: route, error: routeError } = await admin.from("station_printers")
      .select("station_id")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("printer_id", printer.id)
      .eq("active", true)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (routeError) throw routeError;

    const rendered = [
      "PEDEAQUI",
      "",
      "IMPRESSORA CONFIGURADA COM SUCESSO",
      "",
      `Impressora: ${printer.name}`,
      "",
      "Se voce esta lendo este papel,",
      "a conexao esta funcionando.",
      "",
      "Pode fechar a configuracao no painel.",
    ].join("\n");
    const { data: job, error } = await admin.from("print_jobs").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      order_id: null,
      station_id: route?.station_id ?? null,
      printer_id: printer.id,
      document_type: "custom",
      template_key: "setup_test_v1",
      template_version: 1,
      payload: { kind: "setup_test", printer_name: printer.name },
      rendered_content: rendered,
      status: "pending",
      priority: 10,
      copies: 1,
      idempotency_key: `setup-test:${storeId}:${printer.id}:${randomUUID()}`,
      source: "panel",
      created_by: context.userId,
    }).select("id").single();
    if (error) throw error;
    await AuditService.record(context, {
      action: "print.setup_test_queued",
      entityType: "print_job",
      entityId: job.id,
      after: { printerId: printer.id, printerName: printer.name },
    });
    return job.id;
  }

  static async retry(jobId: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const id = uuid.parse(jobId);
    const { data: job, error: readError } = await admin.from("print_jobs")
      .select("id, status, attempts")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (readError) throw readError;
    if (!job) throw new Error("Print job not found");
    if (job.status !== "failed") throw new Error("Only failed jobs can be retried manually");
    const { error } = await admin.from("print_jobs").update({
      status: "pending", attempts: 0, available_at: new Date().toISOString(), failed_at: null,
      claimed_by_agent_id: null, lease_expires_at: null, last_error: null, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "print.job_retried", entityType: "print_job", entityId: id, before: job, after: { status: "pending", attempts: 0 } });
  }

  static async recognizePrinted(jobId: string, reason: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const id = uuid.parse(jobId);
    const safeReason = z.string().trim().min(5).max(500).parse(reason);
    const admin = createAdminClient();
    const { data: job, error: readError } = await admin.from("print_jobs")
      .select("id,status,attempts,last_error")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (readError) throw readError;
    if (!job) throw new Error("Print job not found");
    if (!new Set(["pending", "processing", "failed"]).has(job.status)) throw new Error("Print job cannot be manually recognized from current state");
    const now = new Date().toISOString();
    const { error } = await admin.from("print_jobs").update({
      status: "printed", printed_at: now, failed_at: null, claimed_by_agent_id: null, lease_expires_at: null,
      last_error: null, updated_at: now,
    }).eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("status", ["pending", "processing", "failed"]);
    if (error) throw error;
    await AuditService.record(context, {
      action: "print.job_manually_recognized",
      entityType: "print_job",
      entityId: id,
      before: job,
      after: { status: "printed", recognition: "manual", reason: safeReason },
    });
  }

  static async cancel(jobId: string) {
    const context = await authorize(PERMISSIONS.PRINTING_MANAGE);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const id = uuid.parse(jobId);
    const { data: job, error: readError } = await admin.from("print_jobs")
      .select("id, status")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (readError) throw readError;
    if (!job) throw new Error("Print job not found");
    if (!new Set(["pending", "failed"]).has(job.status)) throw new Error("Processing/printed jobs cannot be cancelled safely");
    const { error } = await admin.from("print_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "print.job_cancelled", entityType: "print_job", entityId: id, before: job, after: { status: "cancelled" } });
  }

  static async reprint(jobId: string, reason: string) {
    const context = await authorize(PERMISSIONS.PRINTING_REPRINT);
    if (!context.storeId) throw new Error("An active store is required");
    const id = uuid.parse(jobId);
    const safeReason = z.string().trim().min(3).max(500).parse(reason);
    const admin = createAdminClient();
    const { data: scoped } = await admin.from("print_jobs").select("id")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle();
    if (!scoped) throw new Error("Print job not found");
    const { data, error } = await admin.rpc("reprint_job_internal", {
      p_job_id: id, p_reason: safeReason, p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return uuid.parse(data);
  }
}
