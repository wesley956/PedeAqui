import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("public menu auth isolation", () => {
  it("uses the stateless public client instead of the cookie-aware server client", () => {
    const service = read("src/server/menu/public-menu-service.ts");
    expect(service).toContain('import { createPublicClient } from "@/lib/supabase/public"');
    expect(service).toContain("createPublicClient()");
    expect(service).not.toContain('from "@/lib/supabase/server"');
  });

  it("does not read browser cookies or persist auth state", () => {
    const client = read("src/lib/supabase/public.ts");
    expect(client).toContain('from "@supabase/supabase-js"');
    expect(client).toContain("persistSession: false");
    expect(client).toContain("autoRefreshToken: false");
    expect(client).toContain("detectSessionInUrl: false");
    expect(client).not.toContain("cookies");
  });
});
