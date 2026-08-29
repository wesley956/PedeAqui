import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("online Pix initial dispatch", () => {
  it("starts the first Pix charge after the authoritative order is created", () => {
    const actions = read("src/features/orders/actions.ts");
    expect(actions).toContain('import { scheduleOrderPixCharge } from "@/server/payments/order-pix-dispatch"');
    expect(actions).toContain("const result = await OrderService.createFromCheckout(storeSlug, token)");
    expect(actions).toContain("scheduleOrderPixCharge(result.order_id)");
  });

  it("keeps PSP failures best-effort and outside the order transaction", () => {
    const dispatch = read("src/server/payments/order-pix-dispatch.ts");
    expect(dispatch).toContain('import { after } from "next/server"');
    expect(dispatch).toContain("after(async () =>");
    expect(dispatch).toContain("await OrderPixService.ensureForOrder(orderId)");
    expect(dispatch).toContain('logger.warn("order_pix_initial_charge_failed"');
  });

  it("keeps public order loading as an idempotent fallback retry path", () => {
    const publicOrder = read("src/server/orders/public-order-service.ts");
    expect(publicOrder).toContain("OrderPixService.ensureForOrder(id)");
  });
});
