// Auditoria de layout no celular: abre cada página em tamanho de celular, tira prints e mede problemas comuns.
// PANEL_BASE: app local com Supabase descartável (painel). PUBLIC_BASE: produção (cardápio público, só leitura).
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const outDir = path.resolve("mobile-audit-out");
await fs.mkdir(path.join(outDir, "shots"), { recursive: true });
const panelBase = process.env.PANEL_BASE?.replace(/\/$/, "");
const publicBase = process.env.PUBLIC_BASE?.replace(/\/$/, "");
const email = process.env.AUDIT_EMAIL;
const password = process.env.AUDIT_PASSWORD;
const results = [];
const safe = (v) => v.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "home";

const PANEL_ROUTES = [
  "/dashboard", "/pedidos", "/pedidos/historico", "/movimento", "/pdv", "/caixa", "/salao", "/producao", "/entregas", "/entregador",
  "/conversas", "/cardapio/disponibilidade", "/cardapio/produtos", "/cardapio/produtos/novo", "/cardapio/categorias", "/cardapio/adicionais",
  "/cardapio/promocoes", "/cardapio/sugestoes", "/clientes", "/financeiro", "/financeiro?aba=lancamentos", "/financeiro?aba=contas",
  "/crescimento", "/crescimento?aba=cupons", "/crescimento/campanhas", "/estoque", "/estoque/fichas", "/compras", "/fornecedores", "/fiscal",
  "/vasilhames", "/equipe", "/escala", "/operacao", "/mais-ferramentas", "/meu-menu", "/assinatura",
  "/configuracoes", "/configuracoes/loja", "/configuracoes/operacao", "/configuracoes/cardapio", "/configuracoes/horarios", "/configuracoes/entrega",
  "/configuracoes/entregadores", "/configuracoes/pagamentos", "/configuracoes/impressoes", "/configuracoes/impressoes/formato", "/configuracoes/impressoes/gerenciar",
  "/configuracoes/caixa", "/configuracoes/salao", "/configuracoes/conversas", "/configuracoes/integracoes", "/configuracoes/modulos", "/configuracoes/fluxo-pedidos",
];

const DEVICES = [
  // Android mais estreito comum (360px) e iPhone padrão (390px). WebKit = motor do Safari.
  { key: "android-360", browser: chromium, options: { ...devices["Galaxy S8"], viewport: { width: 360, height: 740 } } },
  { key: "iphone-390", browser: webkit, options: devices["iPhone 13"] },
];

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
    const label = (el) => {
      const t = (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 50);
      const cls = typeof el.className === "string" ? el.className.split(" ")[0]?.slice(0, 40) : "";
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${t ? ` "${t}"` : ""}`;
    };
    const insideScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const ox = getComputedStyle(p).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true; } return false; };

    const overflowing = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && !insideScroller(el)) overflowing.push({ el: label(el), right: Math.round(r.right), width: Math.round(r.width) });
    }
    const leaf = overflowing.filter((o, i, a) => a.findIndex((x) => x.el === o.el) === i).slice(-8);

    const interactive = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=switch],[role=tab],[role=checkbox],[role=link]")].filter(visible);
    const small = interactive.map((el) => { const r = el.getBoundingClientRect(); return { el: label(el), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.w < 44 || x.h < 44);
    const tiny = small.filter((x) => x.w < 24 || x.h < 24);

    const textSizes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node; let smallText = 0; const smallTextExamples = [];
    while ((node = walker.nextNode())) {
      const txt = node.textContent.trim(); if (txt.length < 2) continue;
      const el = node.parentElement; if (!el || !visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize); textSizes.push(fs);
      if (fs < 12) { smallText += 1; if (smallTextExamples.length < 5) smallTextExamples.push(`${fs}px "${txt.slice(0, 40)}"`); }
    }
    const inputsZoom = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea")].filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).map((el) => `${label(el)} ${getComputedStyle(el).fontSize}`);

    const fixed = [...document.querySelectorAll("body *")].filter((el) => { const p = getComputedStyle(el).position; return (p === "fixed" || p === "sticky") && visible(el); })
      .map((el) => { const r = el.getBoundingClientRect(); return { el: label(el), top: Math.round(r.top), h: Math.round(r.height), pos: getComputedStyle(el).position }; })
      .filter((x) => x.h > 20 && x.top < vh && x.top + x.h > 0);
    const fixedCover = fixed.filter((f) => f.pos === "fixed").reduce((sum, f) => sum + Math.min(f.h, vh), 0);

    return {
      vw, vh,
      docWidth: document.documentElement.scrollWidth,
      docHeight: document.documentElement.scrollHeight,
      screens: Math.round((document.documentElement.scrollHeight / vh) * 10) / 10,
      title: document.title,
      h1: document.querySelector("h1")?.innerText?.trim()?.slice(0, 80) || null,
      overflowing: leaf,
      interactiveCount: interactive.length,
      smallTargets: small.length, tinyTargets: tiny.length, smallTargetExamples: small.slice(0, 8),
      smallText, smallTextExamples, minFont: textSizes.length ? Math.min(...textSizes) : null,
      inputsZoom: inputsZoom.slice(0, 6), inputsZoomCount: inputsZoom.length,
      fixed: fixed.slice(0, 6), fixedCoverPx: fixedCover,
      bodyTextLength: document.body.innerText.trim().length,
    };
  });
}

async function audit(page, device, area, label, url, extra) {
  const errors = [];
  const onConsole = (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); };
  const onPageError = (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`);
  page.on("console", onConsole); page.on("pageerror", onPageError);
  const started = Date.now();
  const entry = { device: device.key, area, label, url };
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 45000 });
    entry.status = res?.status() ?? 0;
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    entry.loadMs = Date.now() - started;
    if (extra?.before) await extra.before(page);
    await page.waitForTimeout(500);
    entry.finalUrl = page.url().replace(/^https?:\/\/[^/]+/, "");
    Object.assign(entry, await measure(page));
    const base = `${device.key}__${area}__${safe(label)}`;
    await page.screenshot({ path: path.join(outDir, "shots", `${base}.jpg`), type: "jpeg", quality: 70 });
    await page.screenshot({ path: path.join(outDir, "shots", `${base}__full.jpg`), type: "jpeg", quality: 55, fullPage: true }).catch(() => {});
    entry.shot = `shots/${base}.jpg`;
    if (device.key === "android-360") {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze().catch(() => null);
      entry.axe = axe ? axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, example: v.nodes[0]?.target?.join(" ")?.slice(0, 120) })) : null;
    }
  } catch (error) {
    entry.error = String(error.message).slice(0, 300);
  }
  entry.consoleErrors = errors.slice(0, 6);
  page.off("console", onConsole); page.off("pageerror", onPageError);
  results.push(entry);
  console.log(`${entry.device} ${area} ${label} → ${entry.status ?? "ERR"} ${entry.finalUrl ?? ""} overflow=${entry.docWidth > entry.vw ? entry.docWidth : "no"} small=${entry.smallTargets ?? "-"} ${entry.error ?? ""}`);
}

async function shotState(page, device, name) {
  const base = `${device.key}__state__${safe(name)}`;
  await page.screenshot({ path: path.join(outDir, "shots", `${base}.jpg`), type: "jpeg", quality: 70 }).catch(() => {});
  results.push({ device: device.key, area: "state", label: name, shot: `shots/${base}.jpg`, ...(await measure(page).catch(() => ({}))) });
}

for (const device of DEVICES) {
  const browser = await device.browser.launch();

  // ---------- Painel (local, loja fictícia) ----------
  if (panelBase) {
    const context = await browser.newContext({ ...device.options, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const page = await context.newPage();
    await audit(page, device, "panel", "login", `${panelBase}/login`);
    try {
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
      console.log(`${device.key} logged in → ${page.url()}`);
    } catch (error) {
      results.push({ device: device.key, area: "panel", label: "login-failed", error: String(error.message).slice(0, 300) });
      await shotState(page, device, "login-failed");
    }

    for (const route of PANEL_ROUTES) await audit(page, device, "panel", route, `${panelBase}${route}`);

    // Páginas com id: pega o primeiro link da lista.
    for (const [list, pattern, name] of [["/pedidos/historico", /^\/pedidos\/[0-9a-f-]{36}$/, "/pedidos/[id]"], ["/cardapio/produtos", /^\/cardapio\/produtos\/[0-9a-f-]{36}$/, "/cardapio/produtos/[id]"], ["/clientes", /^\/clientes\/[0-9a-f-]{36}$/, "/clientes/[id]"], ["/salao", /^\/salao\/[0-9a-f-]{36}$/, "/salao/[tableId]"]]) {
      try {
        await page.goto(`${panelBase}${list}`, { waitUntil: "load" });
        const href = await page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => new URL(a.href).pathname).find((p) => new RegExp(src).test(p)) || null, pattern.source);
        if (href) await audit(page, device, "panel", name, `${panelBase}${href}`);
        else results.push({ device: device.key, area: "panel", label: name, error: "nenhum link encontrado na lista" });
      } catch (error) { results.push({ device: device.key, area: "panel", label: name, error: String(error.message).slice(0, 200) }); }
    }

    // Estados de navegação: "Mais", menu da loja, menu da conta.
    const openState = async (route, selector, name) => {
      try {
        await page.goto(`${panelBase}${route}`, { waitUntil: "load" });
        await page.waitForTimeout(600);
        const target = page.locator(selector).first();
        if (!(await target.count())) { results.push({ device: device.key, area: "state", label: name, error: `não encontrado: ${selector}` }); return; }
        await target.click(); await page.waitForTimeout(700);
        await shotState(page, device, name);
      } catch (error) { results.push({ device: device.key, area: "state", label: name, error: String(error.message).slice(0, 200) }); }
    };
    await openState("/dashboard", ".mobile-more > summary", "menu-mais-aberto");
    await openState("/dashboard", ".app-operation-menu > summary", "menu-loja-aberto");
    await openState("/dashboard", ".app-account-menu > summary", "menu-conta-aberto");
    try {
      await page.goto(`${panelBase}/cardapio/disponibilidade?q=calabresa`, { waitUntil: "load" });
      await page.locator('input[type="search"]').first().fill("calabresa").catch(() => {});
      await page.waitForTimeout(600);
      await shotState(page, device, "disponibilidade-busca-calabresa");
    } catch (error) { results.push({ device: device.key, area: "state", label: "disponibilidade-busca", error: String(error.message).slice(0, 200) }); }

    // Fluxo do cliente na loja fictícia local (pode criar carrinho: banco descartável).
    await audit(page, device, "public-local", "menu", `${panelBase}/m/salgados-da-vila`);
    try {
      await page.locator('a[href*="/produto/"]', { hasText: "Caixa com 30 salgados" }).first().click();
      await page.waitForTimeout(1500);
      await shotState(page, device, "local-produto-sabores");
      await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(400);
      await shotState(page, device, "local-produto-sabores-rolado");
    } catch (error) { results.push({ device: device.key, area: "state", label: "local-produto", error: String(error.message).slice(0, 200) }); }
    try {
      await page.goto(`${panelBase}/m/salgados-da-vila`, { waitUntil: "load" });
      await page.locator('a[href*="/produto/"]', { hasText: "Coca-Cola 2L" }).first().click();
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: /adicionar/i }).first().click();
      await page.waitForTimeout(1500);
      await shotState(page, device, "local-depois-de-adicionar");
      await audit(page, device, "public-local", "carrinho", `${panelBase}/m/salgados-da-vila/carrinho`);
      await audit(page, device, "public-local", "checkout", `${panelBase}/m/salgados-da-vila/checkout`);
    } catch (error) { results.push({ device: device.key, area: "state", label: "local-carrinho", error: String(error.message).slice(0, 200) }); }
    await context.close();
  }

  // ---------- Cardápio público em produção (só leitura, sem fazer pedido) ----------
  if (publicBase) {
    const context = await browser.newContext({ ...device.options, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const page = await context.newPage();
    for (const route of ["/", "/login", "/cadastro", "/planos", "/recursos", "/m/dona-maria-salgados-e-porcoes", "/m/dom-burger", "/m/santa-rita"]) await audit(page, device, "public-prod", route, `${publicBase}${route}`);
    for (const slug of ["dona-maria-salgados-e-porcoes", "dom-burger"]) {
      try {
        await page.goto(`${publicBase}/m/${slug}`, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        await page.evaluate(() => window.scrollBy(0, 900)); await page.waitForTimeout(600);
        await shotState(page, device, `${slug}-rolado`);
        const card = page.locator('a[href*="/produto/"]').first();
        if (await card.count()) {
          await card.click(); await page.waitForTimeout(1500);
          await shotState(page, device, `${slug}-produto-aberto`);
          await page.evaluate(() => window.scrollBy(0, 700)); await page.waitForTimeout(500);
          await shotState(page, device, `${slug}-produto-rolado`);
        }
      } catch (error) { results.push({ device: device.key, area: "state", label: `${slug}-flow`, error: String(error.message).slice(0, 200) }); }
    }
    await context.close();
  }
  await browser.close();
}

await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
console.log(`MOBILE_AUDIT_DONE entries=${results.length}`);
