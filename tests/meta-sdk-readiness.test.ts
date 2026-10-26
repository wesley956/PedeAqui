import type { FacebookSdk } from "../src/features/conversations/facebook-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });
function environment() {
  vi.useFakeTimers();
  const listeners = new Map<string, () => void>();
  const script = { addEventListener: vi.fn((name: string, fn: () => void) => listeners.set(name, fn)), removeEventListener: vi.fn(), id: "", src: "", async: false };
  const win = { FB: undefined as FacebookSdk | undefined, fbAsyncInit: undefined as (() => void) | undefined, setTimeout, clearTimeout };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { getElementById: () => null, createElement: () => script, body: { appendChild: vi.fn() } });
  return { win, listeners, script };
}
describe("Meta SDK readiness", () => {
  it("does not initialize the facade when the outer loader fires load", async () => {
    const { win, listeners } = environment();
    const { loadFacebookSdk } = await import("../src/features/conversations/facebook-sdk");
    const ready = loadFacebookSdk("123456", "v26.0");
    const facade = { init: vi.fn(), login: vi.fn(), __buffer: {} };
    win.FB = facade;
    listeners.get("load")!();
    expect(facade.init).not.toHaveBeenCalled();
    const sdk = { init: vi.fn(), login: vi.fn() };
    win.FB = sdk;
    win.fbAsyncInit!();
    expect(await ready).toBe(sdk);
    expect(sdk.init).toHaveBeenCalledWith({ appId: "123456", cookie: true, xfbml: false, version: "v26.0" });
  });
  it("fails quoted App IDs before calling Meta and reinitializes replacement instances", async () => {
    const { win } = environment();
    const { initializeFacebookSdk } = await import("../src/features/conversations/facebook-sdk");
    win.FB = { init: vi.fn(), login: vi.fn() };
    expect(() => initializeFacebookSdk('"123456"', "v26.0")).toThrow();
    expect(win.FB.init).not.toHaveBeenCalled();
    initializeFacebookSdk("123456", "v26.0");
    const replacement = { init: vi.fn(), login: vi.fn() };
    win.FB = replacement;
    initializeFacebookSdk("123456", "v26.0");
    expect(replacement.init).toHaveBeenCalledTimes(1);
  });
  it("times out a missing bundle and permits a retry", async () => {
    const { win } = environment();
    const { loadFacebookSdk } = await import("../src/features/conversations/facebook-sdk");
    const pending = loadFacebookSdk("123456", "v26.0");
    const rejection = expect(pending).rejects.toThrow("Não foi possível");
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
    win.FB = { init: vi.fn(), login: vi.fn() };
    expect(await loadFacebookSdk("123456", "v26.0")).toBe(win.FB);
  });
});

