import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("configurable print line spacing", () => {
  it("keeps existing stores and jobs on the current normal spacing by default", () => {
    const migration = read("supabase/sql/188_print_line_spacing.sql");
    expect(migration).toContain("line_spacing text not null default 'normal'");
    expect(migration).toContain("'compact', 'normal', 'comfortable', 'wide'");
    expect(migration).toContain("print_jobs_snapshot_line_spacing_internal");
    expect(migration).toContain("new.line_spacing := coalesce(v_line_spacing, 'normal')");
  });

  it("exposes four independent spacing choices in Formato e vias", () => {
    const page = read("src/app/(app)/configuracoes/impressoes/formato/page.tsx");
    const actions = read("src/features/printing/actions.ts");
    const service = read("src/server/printing/print-line-spacing-service.ts");

    expect(page).toContain('name="lineSpacing"');
    expect(page).toContain('value="compact"');
    expect(page).toContain('value="normal"');
    expect(page).toContain('value="comfortable"');
    expect(page).toContain('value="wide"');
    expect(page).toContain("O tamanho das letras continua independente");
    expect(actions).toContain('PrintLineSpacingService.save(text(formData, "lineSpacing") || "normal")');
    expect(service).toContain('z.enum(["compact", "normal", "comfortable", "wide"])');
  });

  it("preserves spacing on retries and reprints by snapshotting it into each job", () => {
    const migration = read("supabase/sql/188_print_line_spacing.sql");
    expect(migration).toContain("new.is_reprint = true and new.original_job_id is not null");
    expect(migration).toContain("select j.line_spacing into v_line_spacing");
    expect(migration).toContain("select p.line_spacing into v_line_spacing");
    expect(migration).toContain("before insert on public.print_jobs");
  });

  it("only exposes a job style to the authenticated agent that owns the processing job", () => {
    const route = read("src/app/api/print-agent/job-style/route.ts");
    expect(route).toContain("authenticatePrintAgentRequest(request)");
    expect(route).toContain('.eq("organization_id", agent.organization_id)');
    expect(route).toContain('.eq("store_id", agent.store_id)');
    expect(route).toContain('.eq("claimed_by_agent_id", agent.id)');
    expect(route).toContain('.eq("status", "processing")');
  });

  it("sends ESC/POS line spacing physically and restores the printer default afterward", () => {
    const agent = read("print-agent/src/index.mjs");
    const escpos = read("print-agent/src/escpos.mjs");

    expect(agent).toContain('post("/api/print-agent/job-style", { jobId })');
    expect(agent).toContain("configurableLineSpacing: true");
    expect(agent).toContain("withLineSpacingIntent(job.renderedContent, lineSpacing)");
    expect(escpos).toContain("0x1b,0x33,lineSpacingByte(styled.lineSpacing, textSize)");
    expect(escpos).toContain('lineSpacing === "compact"');
    expect(escpos).toContain('textSize === "extra_large"');
    expect(escpos).toContain("return 60");
    expect(escpos).toContain("return 72");
    expect(escpos).toContain("0x1b,0x32");
  });
});
