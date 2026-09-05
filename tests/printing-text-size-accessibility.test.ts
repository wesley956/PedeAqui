import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderPrintDocument, resolveOrderPrintPreferences } from "@/server/printing/templates";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const sample = {
  order: {
    id: "order",
    display_number: 42,
    channel: "CARDAPIO",
    fulfillment_type: "pickup",
    customer_name: "Cliente com nome suficientemente longo para validar a quebra de linha",
    subtotal_cents: 2500,
    discount_cents: 0,
    delivery_fee_cents: 0,
    total_cents: 2500,
    payment_method: "cash",
    cash_change_for_cents: null,
    created_at: "2026-09-03T01:00:00-03:00",
  },
  station: { id: "station", name: "Balcão", code: "pedidos", kind: "counter" },
  items: [{
    name: "Produto com descrição longa para testar legibilidade",
    quantity: 2,
    line_total_cents: 2500,
    modifiers: [],
  }],
};

describe("accessible print text size", () => {
  it("keeps current customers and existing jobs on normal text by default", () => {
    expect(resolveOrderPrintPreferences({}).text_size).toBe("normal");
    const migration = read("supabase/sql/186_print_accessibility_text_size.sql");
    expect(migration).toContain("text_size text not null default 'normal'");
    expect(migration).toContain("'normal', 'large', 'extra_large'");
    expect(migration).toContain("print_jobs_snapshot_text_size_internal");
    expect(migration).toContain("before insert on public.print_jobs");
  });

  it("reduces logical line width only for extra-large double-width printing", () => {
    const normal = renderPrintDocument(sample, "receipt", 80, false, { text_size: "normal" });
    const large = renderPrintDocument(sample, "receipt", 80, false, { text_size: "large" });
    const extraLarge = renderPrintDocument(sample, "receipt", 80, false, { text_size: "extra_large" });

    expect(Math.max(...normal.trimEnd().split("\n").map((line) => line.length))).toBeLessThanOrEqual(48);
    expect(Math.max(...large.trimEnd().split("\n").map((line) => line.length))).toBeLessThanOrEqual(48);
    expect(Math.max(...extraLarge.trimEnd().split("\n").map((line) => line.length))).toBeLessThanOrEqual(24);
  });

  it("exposes the accessibility setting in Formato e vias and persists it per store", () => {
    const page = read("src/app/(app)/configuracoes/impressoes/formato/page.tsx");
    const actions = read("src/features/printing/actions.ts");
    const config = read("src/server/printing/print-config-service.ts");
    expect(page).toContain('name="textSize"');
    expect(page).toContain('value="large"');
    expect(page).toContain('value="extra_large"');
    expect(page).toContain("dificuldade para enxergar");
    expect(actions).toContain('text(formData, "textSize")');
    expect(config).toContain("footer_text, text_size");
  });

  it("keeps each job width synchronized with the physical text size sent to the agent", () => {
    const queue = read("src/server/printing/print-queue-service.ts");
    const agent = read("print-agent/src/index.mjs");
    const escpos = read("print-agent/src/escpos.mjs");
    const systemPrint = read("print-agent/src/system-print.mjs");

    expect(queue).toContain("jobTextSize");
    expect(queue).toContain("textSize: jobTextSize");
    expect(queue).toContain("text_size: jobTextSize");
    expect(agent).toContain("job.textSize");
    expect(agent).toContain("accessibleTextSize: true");
    expect(escpos).toContain('textSize === "large"');
    expect(escpos).toContain("return 0x10");
    expect(escpos).toContain('textSize === "extra_large"');
    expect(escpos).toContain("return 0x11");
    expect(systemPrint).toContain("escposDocument(text, textSize)");
  });

  it("bumps the self-updating Print Agent consistently", () => {
    const index = read("print-agent/src/index.mjs");
    const manifest = JSON.parse(read("print-agent/manifest.json"));
    const packageJson = JSON.parse(read("print-agent/package.json"));
    expect(index).toContain('const version = "0.7.1"');
    expect(manifest.version).toBe("0.7.1");
    expect(packageJson.version).toBe("0.7.1");
  });
});
