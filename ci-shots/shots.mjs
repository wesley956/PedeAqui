import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const out = path.resolve("ci-shots/png");
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const log = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: "light" });
const page = await ctx.newPage();
const shot = async (name, opts = {}) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(out, `${name}.png`), ...opts }); log.push(name); };

// ---------- protótipo, opção 3 ----------
await page.goto("file://" + path.resolve("ci-shots/prototipo.html"));
await page.addStyleTag({ content: ".topbar,.notes{display:none!important}.stage{padding:0!important;display:block!important}.phone{width:390px!important;height:844px!important;border-radius:0!important;padding:0!important;box-shadow:none!important}#app{border-radius:0!important}" });
await page.evaluate(() => document.querySelector('#vtabs button[data-v="C"]').click());
await shot("proto-1-menu");
await page.evaluate(() => { const s = document.querySelector("#scroll"); if (s) s.scrollTop = 600; });
await shot("proto-2-menu-rolado");
await page.evaluate(() => { const s = document.querySelector("#scroll"); if (s) s.scrollTop = 0; });
// abre um produto com opções
const opener = page.locator('#app [data-act="open"]').first();
await opener.click();
await shot("proto-3-produto");
await page.locator('#app [data-act="closesheet"]').click();
for (let i = 0; i < 2; i++) await page.locator('#app button.plus[data-act="qplus"]').first().click();
await shot("proto-4-menu-com-carrinho");
await page.locator('#app .cartbar').click();
await shot("proto-5-checkout-topo");
for (const [i, top] of [[6, 700], [7, 1400], [8, 2100]]) {
  await page.evaluate((t) => { const s = document.querySelector("#app .scroll"); if (s) s.scrollTop = t; }, top);
  await shot(`proto-${i}-checkout-${top}`);
}

// ---------- cardápio real (build desta branch) ----------
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/m/santa-rita`, { waitUntil: "networkidle" });
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
await shot("real-1-menu");
await page.mouse.wheel(0, 600);
await shot("real-2-menu-rolado");
await page.mouse.wheel(0, -2000);
const withOptions = page.locator('a[aria-label^="Escolher opções"]').first();
if (await withOptions.count()) {
  await withOptions.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 }).catch(() => log.push("sem dialog"));
  await shot("real-3-produto");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await shot("real-3b-depois-de-fechar");
} else log.push("nenhum produto com opções");
await page.goto(`${BASE}/m/santa-rita`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(out, "real-9-menu-inteiro.png"), fullPage: true });

// ---------- checkout real renderizado com dados de exemplo ----------
for (const name of ["checkout-novo", "checkout-pix", "checkout-erro"]) {
  await page.goto("file://" + path.resolve(`ci-shots/out/${name}.html`));
  await shot(`real-${name}-topo`);
  for (const top of [700, 1400, 2100]) {
    await page.evaluate((t) => { const s = document.querySelector(".stageViewport"); if (s) s.scrollTop = t; }, top);
    await shot(`real-${name}-${top}`);
  }
}
fs.writeFileSync(path.join(out, "log.txt"), log.join("\n"));
await browser.close();
