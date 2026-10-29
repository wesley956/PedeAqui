import type { OperationalHealthIssue } from "@/server/operations/operational-health-service";

export const PRINTING_SAFETY_POLL_MS = 60_000;
export type PrintingSafetyUpdate = { storeId: string; issues: OperationalHealthIssue[] };

/** Visibility and lifetime are provided by the mounted operator panel. */
export async function readPrintingSafety(storeId: string, signal: AbortSignal): Promise<PrintingSafetyUpdate> {
  const response = await fetch("/api/printing/health", { cache: "no-store", signal });
  if (!response.ok) throw new Error("printing_status_unavailable");
  const data = await response.json();
  // An old request must not apply the current cookie-selected store to another panel.
  if (data?.storeId !== storeId || !Array.isArray(data.issues)) throw new Error("printing_store_changed");
  if (!data.issues.every((issue: unknown) => {
    if (!issue || typeof issue !== "object") return false;
    const value = issue as Record<string, unknown>;
    return value.area === "printing" && ["P0", "P1", "P2", "P3"].includes(String(value.severity))
      && ["app", "integration", "local_equipment"].includes(String(value.origin))
      && ["id", "title", "cause", "impact", "action"].every((key) => typeof value[key] === "string");
  })) throw new Error("printing_status_invalid");
  return { storeId, issues: data.issues };
}
