import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc,
  from: (table: string) => {
    const builder = {
      select: () => builder, eq: () => builder, in: () => builder,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({
        data: table === "printers" ? [{ id: "printer", name: "Caixa", connection_type: "system", connection_address: "Test", paper_width_mm: 80 }] : [],
        error: null,
      }).then(resolve),
    };
    return builder;
  },
}) }));
vi.mock("@/server/access/authorize", () => ({ authorize: vi.fn() }));
vi.mock("@/server/audit/audit-service", () => ({ AuditService: { record: vi.fn() } }));

import { PrintQueueService } from "@/server/printing/print-queue-service";
// The distributed agent is plain JavaScript, executed as-is on customers' PCs.
// @ts-expect-error No declaration file for the standalone agent module.
import { resolveJobLineSpacing } from "../print-agent/src/job-style.mjs";

describe("job style travels with claim", () => {
  it.each(["compact", "normal", "comfortable", "wide"])("preserves %s without another HTTP or database lookup", async (lineSpacing) => {
    rpc.mockResolvedValueOnce({ data: [{
      id: "job", printer_id: "printer", copies: 2, document_type: "custom",
      rendered_content: "Test receipt", line_spacing: lineSpacing, text_size: "large",
    }], error: null });
    const jobs = await PrintQueueService.claim({ id: "agent", organization_id: "org", store_id: "store", name: "Test" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ lineSpacing, copies: 2, textSize: "large" });
    const post = vi.fn();
    expect(await resolveJobLineSpacing(jobs[0], post)).toBe(lineSpacing);
    expect(post).not.toHaveBeenCalled();
  });

  it("new agent still reads style from an old server", async () => {
    const post = vi.fn().mockResolvedValue({ lineSpacing: "wide" });
    expect(await resolveJobLineSpacing({ id: "old-job" }, post)).toBe("wide");
    expect(post).toHaveBeenCalledExactlyOnceWith("/api/print-agent/job-style", { jobId: "old-job" });
  });

  it("retains normal spacing when the old server returns an invalid style or fails", async () => {
    expect(await resolveJobLineSpacing({ id: "job", lineSpacing: "invalid" }, vi.fn().mockResolvedValue({ lineSpacing: "invalid" }))).toBe("normal");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await resolveJobLineSpacing({ id: "job" }, vi.fn().mockRejectedValue(new Error("offline")))).toBe("normal");
    } finally { log.mockRestore(); }
  });

  it("keeps the fallback route available to already-installed agents", () => {
    const route = readFileSync("src/app/api/print-agent/job-style/route.ts", "utf8");
    expect(route).toContain('.eq("claimed_by_agent_id", agent.id)');
    expect(route).toContain('.eq("status", "processing")');
  });
});
