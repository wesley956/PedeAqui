import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("movement mode #885", () => {
  const mode = read("src/features/operations/movement-mode.tsx");

  it("reuses the authoritative order action instead of creating another state machine", () => {
    expect(mode).toContain("primaryActionForOrder");
    expect(mode).toContain("OrderActionForm");
    expect(mode).not.toContain("from(\"orders\")");
    expect(mode).not.toContain("update({");
  });

  it("prioritizes severe work and keeps one primary action per row", () => {
    expect(mode).toContain("rank[a.severity] - rank[b.severity]");
    expect(mode.match(/<OrderActionForm/g)).toHaveLength(1);
    expect(mode).toContain("Ver detalhes");
  });

  it("updates incrementally and supports role-oriented filters", () => {
    expect(mode).toContain('surface: "movement"');
    for (const label of ["Atendimento", "Cozinha", "Expedição"]) expect(mode).toContain(label);
  });
});
