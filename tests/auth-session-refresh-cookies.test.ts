import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ authenticated: true, fail: false }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (items: Array<{ name: string; value: string; options: { path: string; httpOnly: boolean; sameSite: "lax"; maxAge?: number } }>) => void } }) => ({
  auth: { getClaims: async () => {
    options.cookies.setAll([{ name: "sb-session", value: mock.authenticated ? "renewed-session" : "", options: { path: "/", httpOnly: true, sameSite: "lax", ...(mock.authenticated ? {} : { maxAge: 0 }) } }]);
    if (mock.fail) throw new Error("refresh unavailable");
    return { data: mock.authenticated ? { claims: { sub: "user" } } : null };
  } },
}) }));
import { updateSession } from "@/lib/supabase/proxy";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable");
  mock.authenticated = true;
  mock.fail = false;
});
afterEach(() => vi.unstubAllEnvs());

describe("session refresh survives redirects and request forwarding", () => {
  it("keeps renewed session cookies when redirecting an authenticated login to the panel", async () => {
    const response = await updateSession(new NextRequest("https://pedeaqui.test/login?next=/pedidos", { headers: { cookie: "sb-session=old" } }));
    expect(response.headers.get("location")).toBe("https://pedeaqui.test/pedidos");
    expect(response.cookies.get("sb-session")?.value).toBe("renewed-session");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("forwards the renewed cookie to Server Components instead of the stale request cookie", async () => {
    const response = await updateSession(new NextRequest("https://pedeaqui.test/pedidos", { headers: { cookie: "sb-session=old; unrelated=keep" } }));
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-session=renewed-session");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("unrelated=keep");
    expect(response.headers.get("x-middleware-request-cookie")).not.toContain("sb-session=old");
  });
  it("clears invalid cookies on the login redirect so stale refresh tokens are not retried", async () => {
    mock.authenticated = false;
    const response = await updateSession(new NextRequest("https://pedeaqui.test/pedidos"));
    expect(response.headers.get("location")).toContain("/login?next=");
    expect(response.cookies.get("sb-session")?.value).toBe("");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("preserves cookie cleanup even if refresh throws before redirecting to auth recovery", async () => {
    mock.authenticated = false;
    mock.fail = true;
    const response = await updateSession(new NextRequest("https://pedeaqui.test/pedidos"));
    expect(response.headers.get("location")).toContain("error=auth_unavailable");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
