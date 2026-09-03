import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const srcRoot = path.join(root, "src");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [absolute] : [];
  });
}

const sourceFiles = walk(srcRoot);
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("stabilization #820 public security surface", () => {
  it("never exposes a service-role key through NEXT_PUBLIC variables", () => {
    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, path.relative(root, file)).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/i);
    }
  });

  it("never references the service-role credential from a client module", () => {
    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      const firstStatement = source.trimStart().split("\n").slice(0, 3).join("\n");
      const isClientModule = /["']use client["']/.test(firstStatement);
      if (isClientModule) {
        expect(source, path.relative(root, file)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(source, path.relative(root, file)).not.toContain("createAdminClient");
      }
    }
  });

  it("keeps the privileged Supabase client server-only and non-persistent", () => {
    const admin = read("src/lib/supabase/admin.ts");
    expect(admin).toContain('import "server-only"');
    expect(admin).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(admin).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/i);
    expect(admin).toContain("persistSession: false");
    expect(admin).toContain("autoRefreshToken: false");
    expect(admin).toContain("detectSessionInUrl: false");
  });

  it("uses only publishable credentials in browser/public clients", () => {
    const browser = read("src/lib/supabase/client.ts");
    const publicServer = read("src/lib/supabase/public.ts");

    expect(browser).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(browser).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    expect(publicServer).toContain('import "server-only"');
    expect(publicServer).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(publicServer).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps stabilization diagnostics and idempotency functions backend-only", () => {
    const idempotency = read("supabase/sql/183_stabilization_driver_idempotency_and_index_hardening.sql");
    const integrity = read("supabase/sql/184_stabilization_data_integrity_diagnostics.sql");

    for (const sql of [idempotency, integrity]) {
      expect(sql).toContain("set search_path = ''");
      expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]+from\s+public/gi);
      expect(sql).toMatch(/revoke[\s\S]+from\s+anon/gi);
      expect(sql).toMatch(/revoke[\s\S]+from\s+authenticated/gi);
      expect(sql).toMatch(/grant\s+execute[\s\S]+to\s+service_role/gi);
    }
  });
});
