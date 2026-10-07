import { describe, expect, it } from "vitest";
import { friendlyOrderActionError } from "@/features/orders/order-action-error";

describe("financial order completion errors", () => {
  it.each([new Error("financial payment account unavailable"), { code: "P0001", message: "financial payment account unavailable" }])("explains unavailable payment accounts for Error and RPC errors", (error) => {
    expect(friendlyOrderActionError(error)).toContain("conta financeira");
    expect(friendlyOrderActionError(error)).toContain("Financeiro");
  });
  it("does not reveal unknown RPC messages", () => {
    expect(friendlyOrderActionError({ message: "internal credentials diagnostic" })).not.toContain("credentials");
  });
});
