import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("operational topbar", () => {
  it("removes internal multi-tenant wording from the visible shell", () => {
    const shell = read("src/components/layout/app-shell.tsx");
    expect(shell).not.toContain("Unidade atual protegida pelo contexto multiempresa");
    expect(shell).toContain("<OperationTopbar");
  });

  it("shows only authoritative store and cash information with a fallback", () => {
    const topbar = read("src/components/layout/operation-topbar.tsx");
    expect(topbar).toContain("data.storeName");
    expect(topbar).toContain("data.storeStatus");
    expect(topbar).toContain("data.cashStatus");
    expect(topbar).toContain("Operação disponível");
  });

  it("loads cash state only for users that actually have cash.view", () => {
    const service = read("src/server/access/operation-header-service.ts");
    expect(service).toContain("permissionKeys.includes(PERMISSIONS.CASH_VIEW)");
    expect(service).toContain("await authorize(PERMISSIONS.CASH_VIEW, context)");
  });

  it("does not add client polling for operational signals", () => {
    const files = [read("src/components/layout/operation-topbar.tsx"), read("src/server/access/operation-header-service.ts")].join("\n");
    expect(files).not.toContain("setInterval");
    expect(files).not.toContain("setTimeout");
    expect(files).not.toContain("useEffect");
  });
});
