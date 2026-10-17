import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOrderView, rememberOrderView, subscribeOrderView } from "@/features/orders/order-view-preference";

let browser: EventTarget & { localStorage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } };
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  browser = Object.assign(new EventTarget(), { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } });
  vi.stubGlobal("window", browser);
});
afterEach(() => vi.unstubAllGlobals());

describe("orders view preference", () => {
  it.each(["list", "board", "queue"] as const)("restores %s after leaving the page and subscribing again", (view) => {
    const key = `orders:view:v1:operator:store:${view}`;
    const beforeLeaving = vi.fn();
    const leave = subscribeOrderView(key, beforeLeaving);
    rememberOrderView(key, view);
    expect(beforeLeaving).toHaveBeenCalledOnce();
    leave();
    const returnToPage = vi.fn();
    const leaveAgain = subscribeOrderView(key, returnToPage);
    expect(readOrderView(key)).toBe(view);
    rememberOrderView(key, view === "list" ? "board" : "list");
    expect(beforeLeaving).toHaveBeenCalledOnce();
    expect(returnToPage).toHaveBeenCalledOnce();
    leaveAgain();
  });
  it("keeps preferences separate for different stores and operators", () => {
    rememberOrderView("orders:view:v1:alice:storeA", "list");
    rememberOrderView("orders:view:v1:alice:storeB", "board");
    expect(readOrderView("orders:view:v1:alice:storeA")).toBe("list");
    expect(readOrderView("orders:view:v1:alice:storeB")).toBe("board");
    expect(readOrderView("orders:view:v1:bob:storeA")).toBe("queue");
  });
  it("uses the default for missing or invalid values", () => {
    values.set("invalid", "unexpected");
    expect(readOrderView("missing")).toBe("queue");
    expect(readOrderView("invalid")).toBe("queue");
  });
  it("still changes the view when storage access is denied", () => {
    browser.localStorage.getItem = () => { throw new Error("blocked"); };
    browser.localStorage.setItem = () => { throw new Error("blocked"); };
    expect(readOrderView("blocked")).toBe("queue");
    rememberOrderView("blocked", "board");
    expect(readOrderView("blocked")).toBe("board");
    rememberOrderView("blocked", "list");
    expect(readOrderView("blocked")).toBe("list");
  });
  it("updates an open page after another tab changes its preference", () => {
    const changed = vi.fn();
    const leave = subscribeOrderView("tab-view", changed);
    values.set("tab-view", "board");
    browser.dispatchEvent(Object.assign(new Event("storage"), { key: "different-store" }));
    expect(changed).not.toHaveBeenCalled();
    browser.dispatchEvent(Object.assign(new Event("storage"), { key: "tab-view" }));
    expect(changed).toHaveBeenCalledOnce();
    expect(readOrderView("tab-view")).toBe("board");
    leave();
  });
});
