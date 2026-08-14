import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const migratedFiles = [
  "src/app/shell.css",
  "src/components/layout/app-shell.tsx",
  "src/components/auth/auth-card.tsx",
  "src/components/auth/auth-card.module.css",
  "src/components/auth/auth-flow.module.css",
  "src/app/login/page.tsx",
  "src/app/cadastro/page.tsx",
  "src/app/recuperar-senha/page.tsx",
  "src/app/nova-senha/page.tsx",
] as const;

describe("PedeAqui shared style migration", () => {
  it("does not reintroduce local hexadecimal colors in migrated areas", () => {
    for (const file of migratedFiles) {
      expect(read(file), file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it("keeps AppShell layout out of inline object styles", () => {
    const shell = read("src/components/layout/app-shell.tsx");
    expect(shell).not.toContain("style={{");
    expect(shell).toContain("style={style}");
    expect(shell).toContain('"--accent"');
    expect(shell).toContain('"--accent-strong"');
  });

  it("uses semantic shell tokens for shared visual roles", () => {
    const css = read("src/app/shell.css");
    expect(css).toContain("var(--surface-0)");
    expect(css).toContain("var(--border-default)");
    expect(css).toContain("var(--focus-ring)");
    expect(css).toContain("var(--space-6)");
    expect(css).toContain("var(--content-wide)");
    expect(css).toContain("var(--z-sticky)");
  });

  it("migrates the shared auth card and main auth flows", () => {
    const authCard = read("src/components/auth/auth-card.tsx");
    expect(authCard).toContain('import styles from "./auth-card.module.css"');
    expect(authCard).not.toContain("style={{");

    for (const file of [
      "src/app/login/page.tsx",
      "src/app/cadastro/page.tsx",
      "src/app/recuperar-senha/page.tsx",
      "src/app/nova-senha/page.tsx",
    ]) {
      const content = read(file);
      expect(content, file).toContain("auth-flow.module.css");
      expect(content, file).not.toContain("style={{");
      expect(content, file).toContain("<Alert");
    }
  });

  it("documents the runtime white-label exception", () => {
    const docs = read("docs/STYLE_MIGRATION.md");
    expect(docs).toContain("White-label do AppShell");
    expect(docs).toContain("--accent");
    expect(docs).toContain("Exceções justificadas");
  });
});
