import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function filesUnder(directory: string): string[] {
  const absolute = join(root, directory);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    if (statSync(path).isDirectory()) return filesUnder(relative(root, path));
    return [path];
  });
}

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const criticalInternalRpcs = [
  "create_order_from_checkout_internal",
  "order_transition_internal",
  "order_start_production_internal",
  "payment_create_intent_internal",
  "payment_confirm_internal",
  "payment_fail_internal",
  "pdv_create_order_internal",
  "enqueue_order_print_internal",
  "print_agent_claim_internal",
  "print_agent_ack_internal",
  "print_agent_fail_internal",
  "print_agent_heartbeat_internal",
  "reprint_job_internal",
  "dashboard_snapshot_internal",
] as const;

describe("security hardening contracts", () => {
  it("never imports the admin client or service role into client components", () => {
    const clientFiles = filesUnder("src").filter((path) => /\.(ts|tsx)$/.test(path) && readFileSync(path, "utf8").startsWith('"use client"'));
    expect(clientFiles.length).toBeGreaterThan(0);
    for (const path of clientFiles) {
      const content = readFileSync(path, "utf8");
      expect(content, relative(root, path)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(content, relative(root, path)).not.toContain("@/lib/supabase/admin");
      expect(content, relative(root, path)).not.toContain("createAdminClient");
    }
  });

  it("keeps the admin client server-only and the secret non-public", () => {
    expect(source("src/lib/supabase/admin.ts").startsWith('import "server-only"')).toBe(true);
    expect(source(".env.example")).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(source(".env.example")).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps critical RPCs invoker-only and revokes browser execution", () => {
    const sql = filesUnder("supabase/sql").filter((path) => path.endsWith(".sql")).map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();
    for (const functionName of criticalInternalRpcs) {
      const name = functionName.toLowerCase();
      const definitions = [...sql.matchAll(new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?\\$\\$;`, "g"))];
      expect(definitions.length, `${name} must have a definition`).toBeGreaterThan(0);
      const latestDefinition = definitions.at(-1)?.[0] ?? "";
      expect(latestDefinition, `${name} must be SECURITY INVOKER`).toContain("security invoker");
      expect(latestDefinition, `${name} must not be SECURITY DEFINER`).not.toContain("security definer");
      expect(sql, `${name} must revoke browser execution`).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${name}[\\s\\S]*?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`));
      expect(sql, `${name} must grant only server execution`).toMatch(new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}[\\s\\S]*?to\\s+service_role`));
    }
  });

  it("does not use user-editable metadata for SQL authorization", () => {
    const authSql = ["supabase/sql/02_rls_policies.sql", "supabase/sql/05_access_rpc.sql"].map(source).join("\n").toLowerCase();
    expect(authSql).not.toContain("user_metadata");
    expect(authSql).not.toContain("raw_user_meta_data");
  });

  it("ships baseline browser security headers", () => {
    const config = source("next.config.ts");
    for (const header of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(config).toContain(header);
    }
    expect(config).toContain("frame-ancestors 'none'");
    expect(config).toContain("object-src 'none'");
  });
});
