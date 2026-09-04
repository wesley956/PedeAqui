import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = (process.env.BASE_URL || "https://www.pedeaqui.pp.ua").replace(/\/$/, "");
const demoSlug = process.env.DEMO_SLUG || "santa-rita";
const outDir = path.join(process.cwd(), "artifacts", "browser-homologation");
await fs.mkdir(outDir, { recursive: true });

const results = [];
const failures = [];
const safeName = (value) => value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
const criticalImpact = new Set(["critical", "serious"]);

async function auditPage(page, label, url, { screenshot = true, axe = true } = {}) {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  const status = response?.status() ?? 0;
  if (status >= 400 || status === 0) throw new Error(`${label}: HTTP ${status}`);
  await page.waitForTimeout(350);

  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() || null,
    bodyTextLength: document.body.innerText.trim().length,
  }));

  const overflow = metrics.scrollWidth > metrics.width + 2;
  if (overflow) failures.push(`${label}: overflow horizontal ${metrics.scrollWidth}px > ${metrics.width}px`);
  if (metrics.bodyTextLength < 20) failures.push(`${label}: conteúdo principal aparentemente vazio`);

  let violations = [];
  if (axe) {
    const audit = await new AxeBuilder({ page }).analyze();
    violations = audit.violations
      .filter((item) => criticalImpact.has(item.impact))
      .map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length }));
    if (violations.length) failures.push(`${label}: axe serious/critical ${JSON.stringify(violations)}`);
  }

  if (screenshot) {
    await page.screenshot({ path: path.join(outDir, `${safeName(label)}.png`), fullPage: true });
  }

  results.push({ label, url, status, ...metrics, overflow, violations });
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

try {
  await runResponsiveMatrix();
  await runBrowserCompatibility();
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
