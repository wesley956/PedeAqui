import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return cssFiles(file);
    return file.endsWith(".css") ? [file] : [];
  });
}

const selectedState = /aria-current|aria-pressed|aria-selected|data-active|data-selected|:checked/;
const orange = /--accent|--brand-primary|--brand-highlight/;
// Laranja mantido de propósito: botão principal pressionado e etapa atual do acompanhamento do cliente.
const allowed = new Set(["src/components/ui/button.module.css", "src/features/orders/public-order-timeline.module.css"]);

describe("UX2 — fundação visual", () => {
  it("defines the selected-state tokens", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    for (const token of ["--selected: var(--text-primary)", "--on-selected: var(--surface-0)", "--selected-surface:"]) expect(globals).toContain(token);
  });

  it("keeps orange out of selected states (D-01)", () => {
    const offenders: string[] = [];
    for (const file of cssFiles("src")) {
      const relative = file.split(path.sep).join("/");
      if (allowed.has(relative)) continue;
      const content = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of content.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1] ?? "";
        if (selectedState.test(selector) && orange.test(match[2] ?? "")) offenders.push(`${relative}: ${selector.trim().replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
