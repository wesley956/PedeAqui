import { z } from "zod";

export const diagnosticCheckNames = ["runtime", "storage", "startup", "processes", "spooler", "printers", "power", "connectivity", "authentication", "updates"] as const;
// A closed vocabulary prevents uploading logs, command lines, paths, credentials,
// customer data or arbitrary remote command output, even from a broken collector.
export const diagnosticCheckSchema = z.object({
  name: z.enum(diagnosticCheckNames),
  status: z.enum(["ok", "warning", "error", "unavailable", "timeout"]),
  code: z.enum(["checked", "not_windows", "access_denied", "command_failed", "invalid_output", "timeout", "network_error", "unauthorized", "interrupted", "collection_failed", "storage_failed"]),
  values: z.object({
    uptimeSeconds: z.number().finite().nonnegative().optional(),
    freeMemoryMb: z.number().finite().nonnegative().optional(),
    writable: z.boolean().optional(),
    taskFound: z.boolean().optional(),
    taskState: z.enum(["Unknown", "Disabled", "Queued", "Ready", "Running"]).optional(),
    lastTaskResult: z.number().int().optional(),
    blocksBattery: z.boolean().optional(),
    stopsOnBattery: z.boolean().optional(),
    startsAtBoot: z.boolean().optional(),
    startsAtLogin: z.boolean().optional(),
    serviceAccount: z.boolean().optional(),
    agentProcesses: z.number().int().nonnegative().optional(),
    serviceRunning: z.boolean().optional(),
    printerCount: z.number().int().nonnegative().optional(),
    offlineCount: z.number().int().nonnegative().optional(),
    errorCount: z.number().int().nonnegative().optional(),
    queuedJobs: z.number().int().nonnegative().optional(),
    sleepOnAc: z.boolean().optional(),
    sleepOnBattery: z.boolean().optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
    assignedPrinters: z.number().int().nonnegative().optional(),
  }).strip().default({}),
}).strip();

export const diagnosticReportSchema = z.object({
  schemaVersion: z.literal(1),
  agentVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  platform: z.enum(["win32", "linux", "darwin", "other"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  checks: z.array(diagnosticCheckSchema).min(1).max(10),
}).strip().superRefine((report, ctx) => {
  if (new Set(report.checks.map(check => check.name)).size !== report.checks.length) {
    ctx.addIssue({ code: "custom", message: "duplicate_checks" });
  }
  if (Date.parse(report.finishedAt) < Date.parse(report.startedAt)) {
    ctx.addIssue({ code: "custom", message: "invalid_report_dates" });
  }
});

export type DiagnosticReport = z.infer<typeof diagnosticReportSchema>;
export type DiagnosticRequestRow = {
  id: string; agent_id: string; status: string; requested_at: string;
  expires_at: string; completed_at: string | null; report: unknown;
};
