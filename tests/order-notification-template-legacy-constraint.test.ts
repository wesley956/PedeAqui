import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922224500_drop_legacy_order_template_name_check.sql",
  ),
  "utf8",
);

describe("legacy WhatsApp order template name constraint", () => {
  it("drops the duplicate legacy constraint that still carried the invalid regex", () => {
    expect(migration).toContain(
      "drop constraint if exists store_conversation_settings_order_template_name_check",
    );
  });
});
