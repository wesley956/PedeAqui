import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sqlDir = path.join(root, "supabase/sql");
const files = fs.readdirSync(sqlDir).filter((name) => name.endsWith(".sql")).sort();
const prefixes = files.map((name) => Number(name.match(/^(\d+)_/)?.[1]));
function read(relativePath: string) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }

describe("canonical Supabase SQL history", () => {
  it("keeps historical numbering anomalies explicit instead of rewriting applied history", () => {
    const counts = new Map<number, number>();
    for (const prefix of prefixes) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([prefix]) => prefix);
    const max = Math.max(...prefixes);
    const missing = Array.from({ length: max }, (_, index) => index + 1).filter((prefix) => !counts.has(prefix));
    expect(duplicates).toEqual([14]); expect(missing).toEqual([17]);
    expect(files).toContain("14_cart.sql"); expect(files).toContain("14_delivery_fk_indexes.sql");
  });

  it("preserves historical migrations and advances only by append", () => {
    expect(files.at(-1)).toBe("100_whatsapp_embedded_signup.sql");
    for (const file of [
      "90_onboarding_role_permission_conflict_hotfix.sql","91_customer_recognition.sql","92_whatsapp_greeting.sql",
      "93_printing_private_execution_grants.sql","94_finance_effect_sign_integer_compat_hotfix.sql","95_public_menu_anon_security_definer.sql",
      "96_platform_incidents.sql","97_order_payment_providers.sql","98_order_whatsapp_notifications.sql","99_order_whatsapp_template_support.sql",
      "100_whatsapp_embedded_signup.sql",
    ]) expect(files).toContain(file);
    const hotfix = read("supabase/sql/90_onboarding_role_permission_conflict_hotfix.sql");
    expect(hotfix.match(/on conflict do nothing/gi) ?? []).toHaveLength(8);
    expect(hotfix).toContain("create or replace function private.bootstrap_organization");
    expect(hotfix).toContain("set search_path = ''");
  });

  it("documents why prefix 14 and missing 17 must remain unchanged", () => {
    const readme = read("supabase/README.md");
    expect(readme).toContain("dois arquivos com prefixo `14`");
    expect(readme).toContain("Não existe arquivo com prefixo `17`");
    expect(readme).toContain("onboarding_role_permission_conflict_hotfix");
    expect(readme).toContain("append-only");
  });
});
