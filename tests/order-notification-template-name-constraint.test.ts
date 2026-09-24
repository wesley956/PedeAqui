import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260922223000_fix_order_notification_template_name_check.sql",
  ),
  "utf8",
);

describe("WhatsApp order notification template name constraint", () => {
  it("keeps the template name contract without PostgreSQL's invalid large regex quantifier", () => {
    expect(migration).toContain(
      "store_conversation_settings_order_notification_template_name_check",
    );
    expect(migration).toContain(
      "char_length(order_notification_template_name) between 1 and 512",
    );
    expect(migration).toContain(
      "order_notification_template_name ~ '^[a-z0-9_]+$'",
    );
    expect(migration).not.toContain("{1,512}");
  });
});
