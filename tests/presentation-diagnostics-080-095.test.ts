import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\s+/g, " ");

describe("[PA-DIAG-080..090] desempenho e resposta percebida", () => {
  const admin = read("src/server/platform/platform-admin-service.ts");
  const billing = read("src/server/platform/platform-commercial-billing-service.ts");
  const support = read("src/server/platform/platform-support-read-service.ts");
  const button = read("src/components/ui/button.tsx");
  const pending = read("src/components/ui/pending-submit-button.tsx");
  const loading = read("src/app/(app)/loading.tsx");
  const menuCss = read("src/features/menu/menu-browser.module.css");
  const productCard = read("src/features/menu/public-product-card.tsx");
  const product = read("src/app/m/[slug]/produto/[id]/page.tsx");

  it("remove consultas sem uso e deduplica leituras repetidas no mesmo request", () => {
    expect(admin).toContain("static async loadCommercial()");
    const commercialLoad = admin.slice(admin.indexOf("static async loadCommercial()"), admin.indexOf("static async applySubscription"));
    expect(commercialLoad).not.toContain('from("integration_catalog")');
    expect(commercialLoad).not.toContain('from("billing_webhook_receipts")');
    expect(billing).toContain("PlatformAdminService.loadCommercial()");
    expect(support).toContain('import { cache } from "react"');
    expect(support).toContain("const loadPlatformSupportState = cache(");
    expect(support).not.toContain("unstable_cache");
  });

  it("mantém carregamento local, acessível e sem bloquear a tela inteira", () => {
    expect(button).toContain("useFormStatus");
    expect(button).toContain('aria-busy={isLoading || undefined}');
    expect(pending).toContain("useFormStatus");
    expect(pending).toContain("disabled={pending}");
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain("PanelLoading");
  });

  it("mantém imagens e listas longas fora do caminho crítico", () => {
    expect(menuCss).toContain("content-visibility:auto");
    expect(productCard).toContain('loading="lazy"');
    expect(productCard).toContain('decoding="async"');
    expect(product).toContain('fetchPriority="high"');
  });
});

describe("[PA-DIAG-091..095] celular, navegadores e identidade", () => {
  const mobile = read("src/components/layout/mobile-navigation.tsx");
  const mobileCss = read("src/app/mobile.css");
  const platformCss = read("src/app/platform/platform.module.css");
  const brand = read("src/components/brand/pedeaqui-brand.tsx");
  const login = read("src/app/login/page.tsx");
  const layout = read("src/app/layout.tsx");
  const report = read("docs/qa/PRESENTATION_DIAGNOSTICS_046_095_20260822.md");

  it("protege navegação e controles para celular pequeno e toque", () => {
    expect(mobile).toContain('aria-label="Navegação principal mobile"');
    expect(mobile).toContain("limit = 4");
    expect(mobile).toContain("Mais");
    expect(mobileCss).toContain("touch-action: manipulation");
    expect(mobileCss).toContain("safe-area-inset-bottom");
    expect(platformCss).toContain("@media(max-width:430px)");
    expect(platformCss).toContain("@media(pointer:coarse)");
    expect(platformCss).toContain("min-height:48px");
  });

  it("mantém marca canônica e tema estável desde o login", () => {
    expect(brand).toContain('data-brand="pedeaqui-logo"');
    expect(brand).toContain('src="/brand/pedeaqui-symbol.svg"');
    expect(login).toContain("<ThemeSelector />");
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).toContain("pedeaqui-theme");
  });

  it("versiona evidência explícita para todas as cinquenta issues", () => {
    for (let issue = 46; issue <= 95; issue += 1) {
      expect(report).toContain(`PA-DIAG-${String(issue).padStart(3, "0")}`);
    }
    expect(report).toContain("Chrome e Edge");
    expect(report).toContain("sem inventar números de navegador");
    expect(report).toContain("4,9 s");
  });
});
