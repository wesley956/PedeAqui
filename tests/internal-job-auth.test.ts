import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { authorizeInternalJob } from "@/server/jobs/internal-job-auth";

describe("internal job authentication", () => {
  beforeEach(() => {
    rpc.mockReset();
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects requests without a bearer token before opening an admin client", async () => {
    await expect(authorizeInternalJob(new Request("https://example.test"), "campaign_messages")).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts the temporary hosting secret during the migration window", async () => {
    process.env.CRON_SECRET = "transition-secret";
    const request = new Request("https://example.test", { headers: { authorization: "Bearer transition-secret" } });
    await expect(authorizeInternalJob(request, "route_retention")).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("delegates rotated Vault tokens to the service-only database function", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const request = new Request("https://example.test", { headers: { authorization: `Bearer ${"a".repeat(64)}` } });
    await expect(authorizeInternalJob(request, "campaign_messages")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("authorize_internal_job_internal", {
      p_job_key: "campaign_messages",
      p_token: "a".repeat(64),
    });
  });

  it("fails closed when the database rejects the token or returns an error", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: new Error("unavailable") });
    const request = new Request("https://example.test", { headers: { authorization: `Bearer ${"b".repeat(64)}` } });
    await expect(authorizeInternalJob(request, "route_retention")).resolves.toBe(false);
    await expect(authorizeInternalJob(request, "route_retention")).resolves.toBe(false);
  });
});
