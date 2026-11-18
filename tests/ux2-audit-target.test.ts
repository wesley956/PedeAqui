import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localDatabaseConfig, validateTargetRef } from "../scripts/ux2-auditoria/executar-alvo.mjs";

const reference = readFileSync("next.config.ts", "utf8");
const source = `const isGitHubPages = process.env.GITHUB_PAGES === "true";
export const securityHeaders = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
];
export default { poweredByHeader: false, reactStrictMode: true };
`;

describe("release audit target", () => {
  it("adds only the local database hooks while preserving unrelated security and application settings", () => {
    const configured = localDatabaseConfig(source, reference);
    expect(configured).toContain("${homologImages}");
    expect(configured).toContain("${homologConnect}");
    expect(configured).toContain("frame-ancestors 'none'");
    expect(configured).toContain("object-src 'none'");
    expect(configured).toContain("poweredByHeader: false, reactStrictMode: true");
    expect(configured).toContain('const homologHost = isDevelopment ? process.env.PEDEAQUI_HOMOLOG_HOST?.trim() : undefined;');
  });
  it("does not duplicate existing local hooks", () => expect(localDatabaseConfig(reference, reference)).toBe(reference));
  it("refuses unfamiliar or partial configuration instead of weakening the policy", () => {
    expect(() => localDatabaseConfig(source.replace("connect-src", "changed-connect-src"), reference)).toThrow();
    expect(() => localDatabaseConfig("const homologHost = true;", reference)).toThrow();
    expect(() => localDatabaseConfig(source, "")).toThrow();
  });
  it("accepts the release branch", () => expect(() => validateTargetRef("release/ux2-fundacao")).not.toThrow());
  it.each(["main", "refs/heads/main", "release/ux2-a;echo", "release/ux2-../../main", "https://example.com", ""])("refuses target %s", (ref) => {
    expect(() => validateTargetRef(ref)).toThrow();
  });
});
