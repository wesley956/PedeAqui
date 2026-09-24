import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.BASE_URL || "https://www.pedeaqui.pp.ua").replace(/\/$/, "");
const demoSlug = process.env.DEMO_SLUG || "santa-rita";
const outDir = path.join(process.cwd(), "artifacts", "browser-homologation");
const expectedOrigin = new URL(baseUrl).origin;
await fs.mkdir(outDir, { recursive: true });

const results = [];
const failures = [];
const safeName = (value) => value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
const criticalImpact = new Set(["critical", "serious"]);
const compactHtml = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 420);

function isProviderGate({ title, h1, effectiveUrl }) {
  const text = `${title || ""} ${h1 || ""}`.toLowerCase();
  if (text.includes("log in to vercel") || text.includes("login – vercel")) return true;
  try {
    return new URL(effectiveUrl).origin !== expectedOrigin;
  } catch {
    return true;
  }
}

async function auditPage(page, label, url, { screenshot = true, axe = true } = {}) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = response?.status() ?? 0;
  if (status >= 400 || status === 0) throw new Error(`${label}: HTTP ${status}`);
  await page.waitForTimeout(900);

  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() || null,
    bodyTextLength: document.body.innerText.trim().length,
  }));
  const effectiveUrl = page.url();

  if (isProviderGate({ ...metrics, effectiveUrl })) {
    throw new Error(`${label}: homologação desviou para uma tela externa/proteção de provedor (${effectiveUrl}, title=${JSON.stringify(metrics.title)}, h1=${JSON.stringify(metrics.h1)})`);
  }

  const overflow = metrics.scrollWidth > metrics.width + 2;
  if (overflow) failures.push(`${label}: overflow horizontal ${metrics.scrollWidth}px > ${metrics.width}px`);
  if (metrics.bodyTextLength < 20) failures.push(`${label}: conteúdo principal aparentemente vazio`);

  let violations = [];
  if (axe) {
    const audit = await new AxeBuilder({ page }).analyze();
    violations = audit.violations
      .filter((item) => criticalImpact.has(item.impact))
      .map((item) => ({
        id: item.id,
        impact: item.impact,
        help: item.help,
        nodes: item.nodes.length,
        samples: item.nodes.slice(0, 8).map((node) => ({
          target: node.target,
          html: compactHtml(node.html),
          failureSummary: compactHtml(node.failureSummary),
        })),
      }));
    if (violations.length) {
      failures.push(`${label}: axe serious/critical ${JSON.stringify(violations.map(({ id, impact, nodes }) => ({ id, impact, nodes })))}`);
    }
  }

  if (screenshot) {
    await page.screenshot({ path: path.join(outDir, `${safeName(label)}.png`), fullPage: true });
  }

  results.push({ label, url, effectiveUrl, status, ...metrics, overflow, violations });
}

async function runResponsiveMatrix() {
  const browser = await chromium.launch();
  try {
    const widths = [320, 360, 390, 430, 768, 1024, 1366, 1440, 1920];
    for (const width of widths) {
      const height = width <= 430 ? 844 : width <= 1024 ? 900 : 1080;
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await auditPage(page, `chromium-menu-${width}x${height}`, `${baseUrl}/m/${demoSlug}`);
      await context.close();
    }

    for (const [width, height] of [[844, 390], [1024, 768]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await auditPage(page, `chromium-landscape-${width}x${height}`, `${baseUrl}/m/${demoSlug}`);
      await context.close();
    }

    const loginContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await auditPage(await loginContext.newPage(), "chromium-login-mobile", `${baseUrl}/login`);
    await loginContext.close();

    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await auditPage(await desktopContext.newPage(), "chromium-login-desktop", `${baseUrl}/login`);
    await desktopContext.close();
  } finally {
    await browser.close();
  }
}

async function runBrowserCompatibility() {
  const cases = [
    { engine: "chromium", browserType: chromium, context: { ...devices["Desktop Chrome HiDPI"] } },
    { engine: "chromium-android", browserType: chromium, context: { ...devices["Pixel 7"] } },
    { engine: "webkit", browserType: webkit, context: { ...devices["Desktop Safari"] } },
    { engine: "webkit-iphone", browserType: webkit, context: { ...devices["iPhone 14"] } },
  ];

  for (const testCase of cases) {
    const browser = await testCase.browserType.launch();
    try {
      const context = await browser.newContext(testCase.context);
      const page = await context.newPage();
      await auditPage(page, `${testCase.engine}-menu`, `${baseUrl}/m/${demoSlug}`);
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return null;
        const rect = active.getBoundingClientRect();
        return {
          tag: active.tagName,
          text: active.textContent?.trim().slice(0, 80) || active.getAttribute("aria-label"),
          visible: rect.width > 0 && rect.height > 0,
        };
      });
      results.push({ label: `${testCase.engine}-keyboard-focus`, focused });
      if (!focused?.visible) failures.push(`${testCase.engine}: primeiro foco de teclado não ficou em elemento visível`);
      await context.close();
    } finally {
      await browser.close();
    }
  }
}

const checkoutBaseCss = `
:root {
  --brand-primary:#ff5a1f; --brand-highlight:#ff5a1f; --surface-0:#fff; --surface-1:#fff; --surface-2:#f3f4f6;
  --text-primary:#111827; --text-secondary:#6b7280; --text-on-brand:#fff; --border-default:#e5e7eb; --border-width:1px;
  --state-danger:#b91c1c; --state-danger-surface:#fee2e2; --state-danger-text:#991b1b;
  --space-1:4px; --space-2:8px; --space-3:16px; --space-4:24px;
  --font-size-xs:12px; --font-size-sm:14px; --font-size-md:16px; --font-size-lg:20px; --font-size-xl:24px;
}
* { box-sizing:border-box; }
html, body { margin:0; width:100%; height:100%; }
body { font-family:Arial,sans-serif; }
`;

async function checkoutFixtureHtml({ longError = false } = {}) {
  const [checkoutCss, viewportCss] = await Promise.all([
    fs.readFile(path.join(process.cwd(), "src/app/m/[slug]/checkout/checkout.module.css"), "utf8"),
    fs.readFile(path.join(process.cwd(), "src/app/m/[slug]/checkout/checkout-viewport.css"), "utf8"),
  ]);
  const errorText = longError
    ? "Algo mudou no pedido. Confira os dados destacados e tente confirmar novamente. ".repeat(10)
    : "Confira os dados do pedido antes de confirmar.";
  const repeated = Array.from({ length: 10 }, (_, index) => `<p>Item ${index + 1} · conteúdo necessário do resumo do pedido para validar rolagem interna.</p>`).join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"><style>${checkoutBaseCss}\n${checkoutCss}\n${viewportCss}</style></head><body><div class="checkout-visual-viewport"><main class="root"><div class="appShell"><header class="topbar"><a class="back" href="#">← Voltar</a><div class="topTitle"><span>Loja teste</span></div><span class="stepCounter">5/5</span></header><div class="progressTrack"><div class="progressFill" style="width:100%"></div></div><div class="stageViewport"><div role="alert" class="alert">${errorText}</div><section class="stage"><header class="stageHeader"><p class="eyebrow">Revisão</p><h1>Confira seu pedido</h1><p>Revise tudo antes de confirmar.</p></header><div class="stageBody"><section class="review">${repeated}</section></div></section></div><footer class="footer"><div class="footerTotal"><span>Total do pedido</span><strong>R$ 45,00</strong></div><form class="stickyForm"><button id="checkout-confirm" class="finalAction" type="button">Confirmar pedido · R$ 45,00</button></form></footer></div></main></div></body></html>`;
}

async function checkoutMetrics(page) {
  return page.evaluate(() => {
    const button = document.querySelector("#checkout-confirm");
    const footer = document.querySelector("footer");
    const stage = document.querySelector(".stageViewport");
    if (!(button instanceof HTMLElement) || !(footer instanceof HTMLElement) || !(stage instanceof HTMLElement)) return null;
    const buttonRect = button.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const viewportRoot = document.querySelector(".checkout-visual-viewport");
    const rootRect = viewportRoot instanceof HTMLElement ? viewportRoot.getBoundingClientRect() : null;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      buttonTop: buttonRect.top,
      buttonBottom: buttonRect.bottom,
      buttonHeight: buttonRect.height,
      footerTop: footerRect.top,
      footerBottom: footerRect.bottom,
      rootHeight: rootRect?.height ?? null,
      stageClientHeight: stage.clientHeight,
      stageScrollHeight: stage.scrollHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      documentClientHeight: document.documentElement.clientHeight,
    };
  });
}

function assertCheckoutCta(label, metrics) {
  if (!metrics) {
    failures.push(`${label}: checkout fixture incompleta`);
    return;
  }
  const visible = metrics.buttonHeight >= 44 && metrics.buttonTop >= -1 && metrics.buttonBottom <= metrics.innerHeight + 1;
  results.push({ label: `${label}-checkout-cta-visible`, ...metrics, visible });
  if (!visible) failures.push(`${label}: CTA final fora da viewport ${JSON.stringify(metrics)}`);
  if (metrics.footerBottom > metrics.innerHeight + 1) failures.push(`${label}: footer ultrapassou a viewport visual`);
  if (metrics.rootHeight !== null && metrics.rootHeight > metrics.innerHeight + 1) failures.push(`${label}: root ${metrics.rootHeight}px > viewport ${metrics.innerHeight}px`);
  if (metrics.documentScrollHeight > metrics.documentClientHeight + 2) failures.push(`${label}: documento externo rolável; o scroll deve ficar no stageViewport`);
}

async function runCheckoutViewportHomologation() {
  const requiredPortraits = [[320, 568], [360, 640], [390, 844], [412, 915], [430, 932]];
  const engines = [
    { name: "chromium", type: chromium },
    { name: "webkit", type: webkit },
  ];

  for (const engine of engines) {
    const browser = await engine.type.launch();
    try {
      for (const [width, height] of requiredPortraits) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        await page.setContent(await checkoutFixtureHtml({ longError: true }), { waitUntil: "domcontentloaded" });
        assertCheckoutCta(`${engine.name}-checkout-long-error-${width}x${height}`, await checkoutMetrics(page));
        await page.screenshot({ path: path.join(outDir, `${engine.name}-checkout-${width}x${height}.png`) });

        const keyboardHeight = Math.max(320, Math.round(height * 0.52));
        await page.setViewportSize({ width, height: keyboardHeight });
        await page.focus("#checkout-confirm");
        assertCheckoutCta(`${engine.name}-checkout-keyboard-${width}x${keyboardHeight}`, await checkoutMetrics(page));
        await context.close();
      }

      const zoomContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const zoomPage = await zoomContext.newPage();
      await zoomPage.setContent(await checkoutFixtureHtml({ longError: true }), { waitUntil: "domcontentloaded" });
      await zoomPage.addStyleTag({ content: "html { font-size: 200% !important; }" });
      assertCheckoutCta(`${engine.name}-checkout-text-zoom`, await checkoutMetrics(zoomPage));
      await zoomContext.close();
    } finally {
      await browser.close();
    }
  }
}

try {
  await runResponsiveMatrix();
  await runBrowserCompatibility();
  await runCheckoutViewportHomologation();
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
}

await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify({ baseUrl, demoSlug, results, failures }, null, 2));
await fs.writeFile(path.join(outDir, "summary.md"), [
  "# Browser homologation",
  "",
  `- Base URL: ${baseUrl}`,
  `- Demo slug: ${demoSlug}`,
  `- Checks: ${results.length}`,
  `- Failures: ${failures.length}`,
  "",
  ...failures.map((item) => `- ❌ ${item}`),
].join("\n"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Browser homologation passed with ${results.length} checks.`);
