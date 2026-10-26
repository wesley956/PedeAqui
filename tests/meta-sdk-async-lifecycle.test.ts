import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Meta SDK asynchronous lifecycle", () => {
  const source = readFileSync("src/features/conversations/meta-embedded-signup-card.tsx", "utf8");

  it("defines async callback before inserting SDK script", () => {
    const callback = source.indexOf("window.fbAsyncInit = () =>");
    const append = source.indexOf("document.body.appendChild(script)", callback);
    expect(callback).toBeGreaterThan(0);
    expect(append).toBeGreaterThan(callback);
    expect(source).toContain('script.src = "https://connect.facebook.net/pt_BR/sdk.js"');
  });
  it("fails SDK preparation when it cannot initialize", () => {
    expect(source).toContain('sdkPromise = null;');
    expect(source).toContain('window.setTimeout(() => fail(), 15000)');
    expect(source).toContain('sdk.init({ appId, cookie: true, xfbml: false, version })');
  });
  it("keeps login inside user gesture and initializes before it", () => {
    const start = source.indexOf("function connect(mode:");
    const init = source.indexOf("fb.init({ appId: browserConfig.appId", start);
    const login = source.indexOf("loginWithEmbeddedSignup(fb,", init);
    expect(start).toBeGreaterThan(0);
    expect(init).toBeGreaterThan(start);
    expect(login).toBeGreaterThan(init);
    expect(source.slice(init, login)).not.toContain("await ");
  });
});
