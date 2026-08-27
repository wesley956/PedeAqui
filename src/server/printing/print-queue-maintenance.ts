import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type AgentScope = {
  id: string;
  organization_id: string;
  store_id: string;
};

type CandidateJob = {
  id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  lease_expires_at: string | null;
};

export async function closeExhaustedPrintJobs(agent: AgentScope) {
  const admin = createAdminClient();
  const { data: printers, error: printerError } = await admin.from("printers")
    .select("id")
    .eq("organization_id", agent.organization_id)
    .eq("store_id", agent.store_id)
    .eq("agent_id", agent.id)
    .eq("active", true);
  if (printerError) throw printerError;

  const printerIds = (printers ?? []).map((printer) => printer.id);
  if (printerIds.length === 0) return 0;

  const { data: jobs, error: jobsError } = await admin.from("print_jobs")
    .select("id, status, attempts, max_attempts, lease_expires_at")
    .eq("organization_id", agent.organization_id)
    .eq("store_id", agent.store_id)
    .in("printer_id", printerIds)
    .in("status", ["pending", "processing"])
    .limit(250);
  if (jobsError) throw jobsError;

  const now = Date.now();
  const candidates = (jobs ?? []) as CandidateJob[];
  const exhaustedPending = candidates.filter((job) => job.status === "pending"
    && Number(job.attempts) >= Number(job.max_attempts));
  const exhaustedExpired = candidates.filter((job) => job.status === "processing"
    && Number(job.attempts) >= Number(job.max_attempts)
    && job.lease_expires_at
    && new Date(job.lease_expires_at).getTime() < now);

  const failedAt = new Date().toISOString();
  let changed = 0;
  if (exhaustedPending.length > 0) {
    const { data, error } = await admin.from("print_jobs").update({
      status: "failed",
      failed_at: failedAt,
      processing_at: null,
      claimed_by_agent_id: null,
      lease_expires_at: null,
      last_error: "Print Agent não confirmou a impressão antes de atingir o limite de tentativas.",
      updated_at: failedAt,
    }).in("id", exhaustedPending.map((job) => job.id))
      .eq("status", "pending")
      .select("id");
    if (error) throw error;
    changed += data?.length ?? 0;
  }

  if (exhaustedExpired.length > 0) {
    const { data, error } = await admin.from("print_jobs").update({
      status: "failed",
      failed_at: failedAt,
      processing_at: null,
      claimed_by_agent_id: null,
      lease_expires_at: null,
      last_error: "Print Agent perdeu a confirmação da impressão após o limite de tentativas.",
      updated_at: failedAt,
    }).in("id", exhaustedExpired.map((job) => job.id))
      .eq("status", "processing")
      .lt("lease_expires_at", failedAt)
      .select("id");
    if (error) throw error;
    changed += data?.length ?? 0;
  }

  return changed;
}
