import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const service = read("src/server/conversations/human-attention-alert-service.ts");
const alert = read("src/features/conversations/human-attention-alert.tsx");
const shell = read("src/components/layout/app-shell.tsx");
const layout = read("src/app/(app)/layout.tsx");

describe("global human attention alert", () => {
  it("counts only waiting conversations inside the current tenant/store", () => {
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).toContain('.eq("status", "waiting_agent")');
    expect(service).toContain('{ count: "exact" }');
  });

  it("renders in the global app shell and links directly to the waiting queue", () => {
    expect(shell).toContain("<HumanAttentionAlert");
    expect(alert).toContain('status: "waiting_agent"');
    expect(alert).toContain("Atender agora");
    expect(alert).toContain("aguardando atendimento humano");
  });

  it("updates from realtime conversation changes and only loads for authorized users", () => {
    expect(alert).toContain('table: "conversations"');
    expect(alert).toContain("router.refresh()");
    expect(layout).toContain("PERMISSIONS.CONVERSATIONS_VIEW");
    expect(layout).toContain("HumanAttentionAlertService.load()");
  });
});
