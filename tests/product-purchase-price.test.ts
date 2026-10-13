import { describe, expect, it } from "vitest";
import { readModifiersTotal } from "@/features/menu/product-purchase-bar";
const id = "11111111-1111-4111-8111-111111111111";
function form(inputs: unknown[], gasMode?: string) {
  return { querySelectorAll: () => inputs, querySelector: () => gasMode ? { value: gasMode } : null } as unknown as HTMLFormElement;
}
describe("public purchase bar preview", () => {
  it("charges the container only for product plus container", () => {
    expect(readModifiersTotal(form([], "with_container"), {}, 15000)).toBe(15000);
    expect(readModifiersTotal(form([], "exchange"), {}, 15000)).toBe(0);
    expect(readModifiersTotal(form([]), {}, 15000)).toBe(0);
  });
  it("sums distinct options only when selected", () => {
    const option = { dataset: {}, type: "checkbox", name: `modifier_${id}`, value: id, checked: true };
    expect(readModifiersTotal(form([option]), { [id]: 250 })).toBe(250);
    expect(readModifiersTotal(form([{ ...option, checked: false }]), { [id]: 250 })).toBe(0);
  });
  it("uses charged quantity from quantity and equal split selectors without counting twice", () => {
    const option = { dataset: { modifierId: id, pricedQuantity: "3" }, type: "checkbox", name: `modifier_${id}`, value: id, checked: true };
    expect(readModifiersTotal(form([option], "with_container"), { [id]: 150 }, 15000)).toBe(15450);
    expect(readModifiersTotal(form([{ ...option, dataset: { modifierId: id, pricedQuantity: "0" } }]), { [id]: 150 })).toBe(0);
  });
});
