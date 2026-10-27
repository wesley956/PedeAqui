import { describe, expect, it } from "vitest";
import { printingSafetyIssues } from "@/server/printing/printing-safety-policy";

const now = Date.parse("2026-10-27T22:00:00Z");
const fresh = new Date(now - 30_000).toISOString();
const old = new Date(now - 180_000).toISOString();
const agent = { id: "caixa-1", status: "online", last_seen_at: fresh };
const printer = { id: "epson", agent_id: "caixa-1", status: "online", last_seen_at: fresh };

describe("print safety based on the actual destination (#1291)", () => {
  it("does not warn when optional printing is unconfigured", () => {
    expect(printingSafetyIssues([], [], [], now)).toEqual([]);
  });
  it("does not report a newly queued document as delayed", () => {
    expect(printingSafetyIssues([agent], [printer], [{ status: "pending", created_at: fresh }], now)).toEqual([]);
  });
  it("does not trust a persisted online status after heartbeat expiration", () => {
    expect(printingSafetyIssues([{ ...agent, last_seen_at: old }], [printer], [], now)[0]?.id).toBe("printing-destination-unavailable");
  });
  it("another online computer cannot mask a disconnected destination", () => {
    const issues = printingSafetyIssues([{ ...agent, last_seen_at: old }, { ...agent, id: "other" }], [printer], [{ status: "pending", created_at: old }], now);
    expect(issues.map((issue) => issue.id)).toEqual(["printing-destination-unavailable", "printing-documents-delayed"]);
    expect(issues.every((issue) => issue.severity === "P0")).toBe(true);
  });
  it.each([null, "invalid", old])("treats missing/invalid/stale printer signal as unavailable: %s", (last_seen_at) => {
    expect(printingSafetyIssues([agent], [{ ...printer, last_seen_at }], [], now)).toHaveLength(1);
  });
  it("clears the warning after destination recovery and a drained queue", () => {
    expect(printingSafetyIssues([agent], [printer], [], now)).toEqual([]);
  });
  it("shows failed documents even if the hardware is currently online", () => {
    expect(printingSafetyIssues([agent], [printer], [{ status: "failed", created_at: fresh }], now)[0]?.id).toBe("printing-documents-delayed");
  });
  it("does not silently treat a stranded queue without a destination as healthy", () => {
    expect(printingSafetyIssues([], [], [{ status: "pending", created_at: old }], now)).toHaveLength(2);
  });
  it("warns if configured printers exist but none has an active route", () => {
    expect(printingSafetyIssues([], [], [], now, true)[0]?.id).toBe("printing-destination-unavailable");
  });
});
