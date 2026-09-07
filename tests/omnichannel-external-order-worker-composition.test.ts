import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pureHandler = readFileSync(
  "src/server/integrations/runtime/external-order-inbox-handler.ts",
  "utf8",
);
const serverWorker = readFileSync(
  "src/server/integrations/runtime/external-order-worker.ts",
  "utf8",
);

describe("omnichannel external order worker composition", () => {
  it("keeps pure orchestration free from server-only and concrete database imports", () => {
    expect(pureHandler).not.toContain('import "server-only"');
    expect(pureHandler).not.toContain("CanonicalOrderImportService");
    expect(pureHandler).toContain("importOrder: ExternalOrderImporter");
  });

  it("binds the canonical Supabase importer only inside the server-only composition root", () => {
    expect(serverWorker).toContain('import "server-only"');
    expect(serverWorker).toContain("CanonicalOrderImportService");
    expect(serverWorker).toContain("processExternalOrderInboxBatch");
    expect(serverWorker).toContain("CanonicalOrderImportService.import(orderInput)");
  });
});
