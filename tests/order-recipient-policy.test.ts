import { describe, expect, it } from "vitest";
import {
  normalizeComparablePhone,
  resolveOrderRecipientPolicy,
} from "@/server/conversations/order-recipient-policy";

describe("order recipient identity policy", () => {
  it("normalizes Brazilian local phone formats into the comparable canonical form", () => {
    expect(normalizeComparablePhone("(19) 99999-1234")).toBe("5519999991234");
    expect(normalizeComparablePhone("+55 19 99999-1234")).toBe("5519999991234");
  });

  it("prefers the canonical customer phone when it matches the order snapshot", () => {
    expect(resolveOrderRecipientPolicy({
      customerPhoneNormalized: "+55 19 99999-1234",
      customerPhoneSnapshot: "(19) 99999-1234",
    })).toEqual({
      ok: true,
      phoneNormalized: "5519999991234",
      source: "customer",
    });
  });

  it("uses the order snapshot when the order has no canonical customer phone", () => {
    expect(resolveOrderRecipientPolicy({
      customerPhoneNormalized: null,
      customerPhoneSnapshot: "19 98888-4321",
    })).toEqual({
      ok: true,
      phoneNormalized: "5519988884321",
      source: "order_snapshot",
    });
  });

  it("blocks the recipient when canonical customer and snapshot identify different phones", () => {
    expect(resolveOrderRecipientPolicy({
      customerPhoneNormalized: "5519999991234",
      customerPhoneSnapshot: "5519888884321",
    })).toEqual({
      ok: false,
      reason: "customer_phone_conflict",
    });
  });

  it("reports a missing recipient when neither source contains a usable phone", () => {
    expect(resolveOrderRecipientPolicy({
      customerPhoneNormalized: null,
      customerPhoneSnapshot: "",
    })).toEqual({
      ok: false,
      reason: "customer_phone_missing",
    });
  });
});
