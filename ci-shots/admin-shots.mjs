import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("ci-shots/png");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [width, height, tag] of [[1280, 900, "desk"], [390, 844, "cel"]]) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme: "light" });
  for (const when of ["antes", "depois"]) {
    const dir = path.resolve("ci-shots", when);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
      const name = file.replace(".html", "");
      await page.goto("file://" + path.join(dir, file));
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      await page.screenshot({ path: path.join(out, `${name}-${tag}-${when}.png`), fullPage: true });
      if (when === "depois") {
        // simula "Editar" aberto na primeira linha e o menu Ações aberto na segunda
        await page.evaluate(() => {
          document.querySelector("[hidden]")?.removeAttribute("hidden");
          const editors = [...document.querySelectorAll("div[hidden]")]; editors[0]?.removeAttribute("hidden");
          const menus = document.querySelectorAll("details"); const m = menus[1] ?? menus[0]; if (m) m.open = true;
        });
        await page.screenshot({ path: path.join(out, `${name}-${tag}-depois-aberto.png`), fullPage: true });
      }
    }
  }
  await page.close();
}
await browser.close();
