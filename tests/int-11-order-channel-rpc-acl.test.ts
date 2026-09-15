import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("INT-11 order creation RPC ACL hardening", () => {
  it("keeps both canonical order creation overloads restricted to service_role", () => {
    const migration = readFileSync(
      "supabase/migrations/20260915213000_int11_order_channel_rpc_acl.sql",
      "utf8",
    );

    for (const signature of [
      "public.create_order_from_checkout_internal(uuid,text,text,text)",
      "public.create_order_from_checkout_internal(uuid,text,text)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public;`);
      expect(migration).toContain(`revoke all on function ${signature} from anon;`);
      expect(migration).toContain(`revoke all on function ${signature} from authenticated;`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role;`);
    }
  });
});
