export interface AuditResult {
  device?: string;
  label?: string;
  area?: string;
  error?: string;
  ok?: boolean;
  status?: number;
  consoleErrors?: string[];
  scriptPlacementWarning?: boolean;
  docWidth?: number;
  vw?: number;
  clipped?: string[];
  axe?: { impact: string | null }[] | null;
}
export interface AuditFailure { device?: string; label?: string; reasons: string[] }
export function auditFailures(results: AuditResult[]): AuditFailure[];
export function requireLocalTarget(value: unknown): void;
