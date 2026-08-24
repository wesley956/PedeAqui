import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

describe("Meta Embedded Signup browser security", () => {
  it("allows only the official Meta SDK and login frames required by Embedded Signup", () => {
    expect(config).toContain("`script-src 'self' 'unsafe-inline' https://connect.facebook.net${isDevelopment ? \" 'unsafe-eval'\" : \"\"}`");
    expect(config).toContain('frame-src \'self\' https://www.facebook.com https://web.facebook.com');
  });

  it("keeps opener communication available for the Meta OAuth popup", () => {
    expect(config).toContain('{ key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }');
    expect(config).not.toContain('{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }');
  });
});
