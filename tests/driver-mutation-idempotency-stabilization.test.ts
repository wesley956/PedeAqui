import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const forms = read("src/features/delivery/operation-forms.tsx");
const actions = read("src/features/delivery/actions.ts");
const service = read("src/server/delivery/driver-mutation-service.ts");
const sql = read("supabase/sql/181_stabilization_driver_idempotency_and_index_hardening.sql").toLowerCase();

describe("stabilization #819 driver mutation idempotency", () => {
  it("creates and preserves one idempotency key per logical form submission", () => {
    expect(forms).toContain("crypto.randomUUID()");
    expect(forms.match(/name=\"idempotencyKey\"/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(forms).toContain('value={key}');
  });

  it("passes the form key through server actions without regenerating it", () => {
    expect(actions).toMatch(/DriverMutationService\.createDriver\([\s\S]*?text\(formData, \"idempotencyKey\"\)\)/);
    expect(actions).toMatch(/DriverMutationService\.updateDriver\([\s\S]*?text\(formData, \"idempotencyKey\"\)\)/);
    expect(actions).not.toContain("crypto.randomUUID");
  });

  it("authorizes and scopes driver mutations before invoking privileged RPCs", () => {
    expect(service).toContain("authorize(PERMISSIONS.DELIVERY_MANAGE)");
    expect(service).toContain("delivery_create_driver_idempotent_internal");
    expect(service).toContain("delivery_update_driver_idempotent_internal");
    expect(service).toContain('.eq("organization_id", context.organizationId)');
    expect(service).toContain('.eq("store_id", storeId)');
    expect(service).not.toContain("crypto.randomUUID");
  });

  it("serializes identical attempts and replays only the completed response", () => {
    expect(sql).toContain("'delivery.driver.create'");
    expect(sql).toContain("'delivery.driver.update'");
    expect(sql).toContain("request_fingerprint");
    expect(sql).toContain("on conflict (organization_id, scope, idempotency_key) do nothing");
    expect(sql).toContain("for update");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("response_body");
    expect(sql).toContain("idempotency key reused with different driver payload");
  });

  it("keeps the idempotent driver RPCs backend-only", () => {
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(/revoke all on function public\.delivery_create_driver_idempotent_internal[\s\S]*?from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.delivery_update_driver_idempotent_internal[\s\S]*?from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.delivery_create_driver_idempotent_internal[\s\S]*?to service_role/);
    expect(sql).toMatch(/grant execute on function public\.delivery_update_driver_idempotent_internal[\s\S]*?to service_role/);
  });
});
