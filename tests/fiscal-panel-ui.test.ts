import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/(app)/fiscal/page.tsx", "utf8");
const styles = readFileSync("src/app/(app)/fiscal/fiscal-panel.module.css", "utf8");
describe("fiscal panel UI", () => {
  it("separates operational queues", () => {
    for (const label of ["Pendentes", "Exigem atenção", "Concluídos"]) expect(page).toContain(label);
  });
  it("keeps issue and cancel actions authoritative", () => {
    expect(page).toContain("QueueFiscalDocumentForm");
    expect(page).toContain("CancelFiscalDocumentForm");
    expect(page).not.toContain("supabase");
  });
  it("keeps advanced fiscal configuration outside the daily queue", () => {
    expect(page).toContain("Configurações fiscais avançadas");
    expect(page).toContain("Dados fiscais da unidade");
    expect(page).toContain("Dados fiscais dos produtos");
    expect(page).toContain("<details");
  });
  it("collapses the three queues on smaller screens", () => {
    expect(styles).toContain("@media(max-width:980px)");
    expect(styles).toContain(".queues,.configGrid{grid-template-columns:1fr}");
  });
});
