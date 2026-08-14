import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actions = fs.readFileSync(path.join(process.cwd(), "src/features/auth/actions.ts"), "utf8");
const safeReturnPath = fs.readFileSync(path.join(process.cwd(), "src/lib/auth/safe-return-path.ts"), "utf8");
const home = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");

describe("authentication start route contract", () => {
  it("preserves an explicit safe deep link after login", () => {
    expect(actions).toContain("redirect(returnPath ?? await StartRouteService.resolve())");
    expect(actions).toContain("safeInternalPath");
    expect(safeReturnPath).toContain('value.startsWith("/")');
    expect(safeReturnPath).toContain('value.startsWith("//")');
  });

  it("does not force a generic login to dashboard", () => {
    expect(actions).not.toContain('return "/dashboard"');
    expect(actions).toContain("StartRouteService.resolve()");
  });

  it("uses the same contextual resolver for an authenticated root visit", () => {
    expect(home).toContain("StartRouteService.resolve()");
    expect(home).not.toContain('redirect(user ? "/dashboard"');
  });

  it("keeps logout returning to login", () => {
    expect(actions).toContain('redirect("/login")');
  });
});
