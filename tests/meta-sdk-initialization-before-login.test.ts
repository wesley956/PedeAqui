import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Meta signup SDK initialization before login", () => {
  it("initializes SDK synchronously within the click handler before calling FB.login", () => {
    const code = readFileSync("src/features/conversations/meta-embedded-signup-card.tsx", "utf8");
    const start = code.indexOf("function connect(mode:");
    const login = code.indexOf("const codePromise = loginWithEmbeddedSignup(", start);
    const init = code.lastIndexOf("initializeFacebookSdk(browserConfig.appId, browserConfig.graphVersion)", login);
    expect(start).toBeGreaterThan(-1);
    expect(init).toBeGreaterThan(start);
    expect(login).toBeGreaterThan(init);
    expect(code.slice(init, login).replace(/\/\/[^\n]*/g, "")).not.toContain("await ");
  });
});
