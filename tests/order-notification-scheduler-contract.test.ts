import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const vercelConfig = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
) as {
  crons?: Array<{ path?: string; schedule?: string }>;
};

const route = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/internal/order-notifications/route.ts"),
  "utf8",
);

describe("order notification scheduler contract", () => {
  it("schedules the existing retry worker independently of new order events", () => {
    expect(vercelConfig.crons).toContainEqual({
      path: "/api/internal/order-notifications",
      schedule: "* * * * *",
    });
    expect(route).toContain("runOrderWhatsAppNotificationWorker({ limit: 25 })");
  });

  it("keeps scheduled invocations fail-closed behind CRON_SECRET", () => {
    expect(route).toContain("process.env.CRON_SECRET?.trim()");
    expect(route).toContain('request.headers.get("authorization") === `Bearer ${secret}`');
    expect(route).toContain('{ status: 503');
    expect(route).toContain('{ status: 401');
  });

  it("keeps the worker response uncached", () => {
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).toContain("{ ok: true, ...result }");
  });
});
