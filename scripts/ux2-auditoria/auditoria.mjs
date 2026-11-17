// Auditoria visual do UX2: abre cada tela no computador (1366px) e no celular (360px), tira prints e mede problemas comuns.
// Roda só contra a homologação local (PANEL_BASE), com a loja fictícia. Nunca acessa a produção.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { auditFailures, requireLocalTarget } from "./validation.mjs";

const outDir = path.resolve(process.env.AUDIT_OUT || "ux2-auditoria-out");
await fs.mkdir(path.join(outDir, "shots"), { recursive: true });
const panelBase = process.env.PANEL_BASE?.replace(/\/$/, "");
requireLocalTarget(panelBase);
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

// Site institucional e acesso (sem login).
const SITE_ROUTES = ["/", "/como-funciona", "/recursos", "/planos", "/pedidos-e-atendimento", "/entrega-e-fidelizacao", "/empresa", "/cadastro", "/recuperar-senha", "/acesso-entregador", "/termos-de-uso", "/politica-de-privacidade"];
// Painel da plataforma (o usuário da loja fictícia é administrador da plataforma só na homologação local).
const PLATFORM_ROUTES = ["/platform", "/platform/operacao", "/platform/pendencias", "/platform/alertas", "/platform/assinaturas", "/platform/comercial", "/platform/financeiro", "/platform/suporte", "/platform/comunicacao", "/platform/equipe", "/platform/integracoes", "/platform/integridade", "/platform/auditoria", "/platform/configuracoes", "/platform/produto", "/platform/onboarding", "/platform/novo-restaurante", "/platform/apresentacao", "/platform/demo", "/platform/fundadores", "/platform/incidentes", "/platform/operacao/praticidade", "/platform/privacidade", "/platform/suporte/modo"];

const DEVICES = [
  { key: "pc-1366", browser: chromium, options: { viewport: { width: 1366, height: 768 } } },
  // Android mais estreito comum (360px). O iPhone (WebKit) entra só na auditoria completa.
  { key: "android-360", browser: chromium, options: { ...devices["Galaxy S8"], viewport: { width: 360, height: 740 } } },
  // Tema escuro: o painel segue o tema do aparelho quando a pessoa não escolheu um.
  ...(process.env.AUDIT_SEM_ESCURO ? [] : [
    { key: "pc-1366-escuro", browser: chromium, options: { viewport: { width: 1366, height: 768 }, colorScheme: "dark" } },
    { key: "android-360-escuro", browser: chromium, options: { ...devices["Galaxy S8"], viewport: { width: 360, height: 740 }, colorScheme: "dark" } },
  ]),
  ...(process.env.AUDIT_IPHONE ? [{ key: "iphone-390", browser: webkit, options: devices["iPhone 13"] }] : []),
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
  const onConsole = (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 900)); };
  const onPageError = (e) => errors.push(`pageerror: ${String(e.message).slice(0, 900)}`);
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
    // Com "overflow-x: clip" a página não rola de lado: o que passa da borda some sem aviso. Conta campos e botões cortados.
    entry.clipped = await page.evaluate(() => {
      const main = document.querySelector("main"); if (!main) return [];
      const limit = main.getBoundingClientRect().right + 1;
      return [...main.querySelectorAll("input:not([type=hidden]), select, textarea, button, a")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.right > limit && !element.closest('[class*="tabs"], [class*="Tabs"], nav, [class*="scroll"], [class*="chips"], [class*="filters"], [class*="categories"]'); })
        .map((element) => `${element.tagName.toLowerCase()} ${(element.getAttribute("name") || element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 30)} (+${Math.round(element.getBoundingClientRect().right - limit)}px)`).slice(0, 6);
    }).catch(() => []);
    // Celular: um print com a página rolada mostra o que fica preso ao topo e ao rodapé (barras, abas) sobre o conteúdo.
    if (device.key === "android-360" && entry.docHeight > entry.vh + 300) {
      await page.evaluate(() => window.scrollTo(0, 520));
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(outDir, "shots", `${base}__rolado.jpg`), type: "jpeg", quality: 65 }).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    if (device.key === "android-360") {
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze().catch(() => null);
      entry.axe = axe ? axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, example: v.nodes[0]?.target?.join(" ")?.slice(0, 120) })) : null;
    }
  } catch (error) {
    entry.error = String(error.message).slice(0, 300);
  }
  entry.consoleErrors = errors.slice(0, 6);
  entry.scriptPlacementWarning = errors.some((text) => /Cannot render a sync or defer <script>/.test(text)) || undefined;
  page.off("console", onConsole); page.off("pageerror", onPageError);
  results.push(entry);
  // Grava a cada tela: se a execução for interrompida, o que já foi feito fica guardado.
  await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
  console.log(`${entry.device} ${area} ${label} → ${entry.status ?? "ERR"} ${entry.finalUrl ?? ""} overflow=${entry.docWidth > entry.vw ? entry.docWidth : "no"} small=${entry.smallTargets ?? "-"} ${entry.error ?? ""}`);
}

async function shotState(page, device, name) {
  const base = `${device.key}__state__${safe(name)}`;
  await page.screenshot({ path: path.join(outDir, "shots", `${base}.jpg`), type: "jpeg", quality: 70 }).catch(() => {});
  results.push({ device: device.key, area: "state", label: name, shot: `shots/${base}.jpg`, ...(await measure(page).catch(() => ({}))) });
}

// Lista o que está na tela (botões, campos, avisos): mostra o resultado de cada passo e ajuda a escrever o próximo.
async function controls(page) {
  return page.evaluate(() => {
    const visible = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden"; };
    const text = (element) => (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const main = document.querySelector("main") ?? document.body;
    return {
      url: location.pathname + location.search,
      heading: text(document.querySelector("main h1, h1") ?? document.body).slice(0, 80),
      buttons: [...main.querySelectorAll("button, a[role=button]")].filter(visible).map((element) => text(element) + (element.disabled ? " [desativado]" : "")).filter(Boolean).slice(0, 40),
      fields: [...main.querySelectorAll("input:not([type=hidden]), select, textarea")].filter(visible).map((element) => `${element.tagName.toLowerCase()}[${element.getAttribute("name") ?? ""}] ${element.getAttribute("aria-label") ?? element.getAttribute("placeholder") ?? element.closest("label")?.textContent?.trim().slice(0, 40) ?? ""}`).slice(0, 30),
      notices: [...document.querySelectorAll('[role=alert], [role=status], [aria-live]')].filter(visible).map(text).filter(Boolean).slice(0, 8),
      dialogs: [...document.querySelectorAll("dialog[open], [role=dialog]")].filter(visible).map((element) => text(element.querySelector("h1,h2,h3") ?? element)).slice(0, 4),
    };
  }).catch((error) => ({ error: String(error.message).slice(0, 200) }));
}

async function runFlows(page, device) {
  const quick = { timeout: 8000 };
  const log = async (flow, stepName, action, verify, target = page) => {
    const entry = { device: device.key, area: "fluxo", label: `${flow} › ${stepName}` };
    try { await action(); await target.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}); await target.waitForTimeout(900); if (verify) { await verify(); entry.verified = true; } entry.ok = true; }
    catch (error) { entry.ok = false; entry.error = String(error.message).split("\n")[0].slice(0, 220); }
    entry.screen = await controls(target);
    // O banco local às vezes derruba uma conexão (B-06) e a página cai na tela de erro: tenta de novo uma vez e anota.
    if ((entry.screen.buttons ?? []).length === 1 && entry.screen.buttons[0] === "Tentar novamente") {
      entry.ok = false;
      entry.error = "A operação abriu uma tela de erro; recarregar não confirma seu resultado.";
      entry.retried = true;
      await target.reload({ waitUntil: "load" }).catch(() => {});
      await target.waitForTimeout(1200);
      entry.screen = await controls(target);
    }
    const base = `${device.key}__fluxo__${safe(`${flow}-${stepName}`)}`;
    await target.screenshot({ path: path.join(outDir, "shots", `${base}.jpg`), type: "jpeg", quality: 70 }).catch(() => {});
    entry.shot = `shots/${base}.jpg`;
    results.push(entry);
    await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
    console.log(`FLUXO ${entry.label} ${entry.ok ? "ok" : `FALHOU ${entry.error}`}`);
    return entry.ok;
  };
  const open = (route) => page.goto(`${panelBase}${route}`, { waitUntil: "load", timeout: 45000 });
  const clickButton = (pattern) => page.getByRole("button", { name: pattern }).first().click(quick);
  const visibleText = (pattern) => page.getByText(pattern).first().waitFor({ state: "visible", timeout: 10000 });

  // 1) Caixa: abrir com saldo inicial.
  await log("caixa", "1-abrir-tela", () => open("/caixa"));
  await log("caixa", "2-abrir-caixa", async () => {
    await page.locator('input[name="openingBalance"]').fill("100,00", quick);
    await clickButton(/^Abrir caixa$/);
  }, () => visibleText("Caixa aberto para o turno."));

  // 2) Venda no PDV: sem caixa aberto o sistema avisa; com caixa aberto, finaliza em dinheiro com troco.
  await log("pdv", "1-abrir", () => open("/pdv"));
  await log("pdv", "2-adicionar-item", () => page.locator("button", { hasText: "Coca-Cola 2L" }).first().click(quick));
  await log("pdv", "3-valor-recebido", () => page.getByPlaceholder("Ex.: 50,00").first().fill("20,00", quick));
  await log("pdv", "4-finalizar", () => page.locator('button[type="submit"]', { hasText: /Finalizar/ }).first().click(quick),
    () => visibleText(/Venda #\d+ finalizada em R\$\s*15,00\. Troco: R\$\s*5,00/));
  // Venda com produto que tem opções (sabores), no cartão.
  await log("pdv", "5-produto-com-opcoes", () => page.locator("button", { hasText: "Copo com 12 salgados" }).first().click(quick));

  // 3) Cliente sem sessão do painel: criar um pedido real no checkout e guardar sua identidade.
  const customerContext = await page.context().browser().newContext({ viewport: device.options.viewport, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const customer = await customerContext.newPage();
  const customerLog = (step, action, verify) => log("cliente", step, action, verify, customer);
  let createdOrderId = null;
  await customerLog("1-produto-no-cardapio", async () => {
    await customer.goto(`${panelBase}/m/salgados-da-vila`, { waitUntil: "load" });
    await customer.getByRole("button", { name: "Adicionar Coca-Cola 2L ao carrinho", exact: true }).click(quick);
  });
  await customerLog("2-carrinho-e-checkout", async () => {
    await customer.goto(`${panelBase}/m/salgados-da-vila/carrinho`, { waitUntil: "load" });
    await customer.getByText("Coca-Cola 2L", { exact: true }).first().waitFor({ state: "visible", timeout: 10000 });
    await customer.locator('a[href="/m/salgados-da-vila/checkout"]').click(quick);
    await customer.locator('input[name="phone"]').waitFor({ state: "visible", timeout: 10000 });
  });
  await customerLog("3-dados-retirada-dinheiro", async () => {
    await customer.getByRole("button", { name: /^Retirada/ }).click(quick);
    await customer.locator('input[name="phone"]').fill("19988887777", quick);
    await customer.locator('input[name="name"]').fill("Cliente da auditoria UX2", quick);
    await customer.locator('input[name="paymentMethod"][value="cash"]').check(quick);
    const review = customer.getByRole("button", { name: /^Calcular total/ });
    if (await review.isVisible()) {
      await review.click(quick);
      await customer.getByRole("button", { name: /^Confirmar pedido/ }).waitFor({ state: "visible", timeout: 15000 });
    }
  });
  await customerLog("4-confirmar-pedido-novo", async () => {
    await customer.getByRole("button", { name: /^Confirmar pedido · R\$\s*15,00$/ }).click(quick);
    await customer.waitForURL((url) => /^\/m\/salgados-da-vila\/pedido\/[0-9a-f-]{36}$/.test(url.pathname), { timeout: 20000 });
    createdOrderId = new URL(customer.url()).pathname.split("/").pop();
  }, () => customer.getByRole("heading", { name: "Pedido confirmado", exact: true }).waitFor({ state: "visible", timeout: 10000 }));
  results[results.length - 1].orderId = createdOrderId;

  // Abrir no painel exatamente o pedido criado pelo cliente, sem usar pedidos do seed como substituto.
  await log("pedido", "1-abrir-lista", () => open("/pedidos"));
  const detailReady = await log("pedido", "2-abrir-detalhe", async () => {
    if (!createdOrderId) throw new Error("O checkout não criou um pedido; o roteiro não usará outro pedido da loja.");
    const link = page.locator(`a[href^="/pedidos/${createdOrderId}"]`).first();
    await link.waitFor({ state: "visible", timeout: 15000 });
    await link.click(quick);
  }, () => page.getByRole("button", { name: "Aceitar pedido", exact: true }).waitFor({ state: "visible", timeout: 10000 }));
  if (!detailReady) {
    await customerContext.close();
    return;
  }
  const nextAction = /^(Aceitar pedido|Iniciar preparo|Iniciar produção|Marcar pronto|Marcar como pronto|Liberar retirada|Confirmar retirada|Liberar entrega|Cliente retirou|Cliente recebeu|Entregar ao cliente|Marcar retirado|Marcar como retirado|Marcar entregue|Marcar como entregue|Saiu para entrega|Registrar pagamento|Marcar como pago|Marcar pago|Confirmar pagamento|Finalizar pedido|Concluir pedido|Finalizar|Concluir)$/;
  const statusGrid = page.getByLabel("Situação atual do pedido");
  let completed = false;
  for (let index = 3; index <= 9; index += 1) {
    if (/Concluído/.test(await statusGrid.innerText(quick))) { completed = true; break; }
    let clicked = "";
    const before = await statusGrid.innerText(quick);
    const done = await log("pedido", `${index}-proxima-acao`, async () => {
      const button = page.getByRole("button", { name: nextAction }).first();
      clicked = ((await button.textContent(quick)) ?? "").trim();
      await button.click(quick);
    }, () => page.waitForFunction((previous) => {
      const current = document.querySelector('[aria-label="Situação atual do pedido"]')?.innerText;
      return current && current !== previous;
    }, before, { timeout: 10000 }));
    results[results.length - 1].clicked = clicked;
    if (!done) break;
  }
  await log("pedido", "10-confirmar-conclusao", async () => {
    completed ||= /Concluído/.test(await statusGrid.innerText(quick));
    if (!completed) throw new Error("O pedido não chegou ao estado Concluído.");
  });
  await customerLog("5-acompanhamento-concluido", async () => {
    if (!createdOrderId) throw new Error("Pedido novo ausente.");
    await customer.reload({ waitUntil: "load" });
  }, () => customer.getByRole("heading", { name: "Pedido concluído!", exact: true }).waitFor({ state: "visible", timeout: 10000 }));
  await customerContext.close();

  // 4) Salão: abrir mesa, lançar item, enviar para produção e pedir a conta.
  await log("salao", "1-abrir-lista", () => open("/salao"));
  await log("salao", "2-abrir-mesa", () => page.locator('a[href^="/salao/"]').first().click(quick));
  await log("salao", "3-abrir-atendimento", () => clickButton(/^Abrir mesa$/));
  await log("salao", "4-lancar-item", () => page.locator("button", { hasText: "Coca-Cola 2L" }).first().click(quick));
  await log("salao", "5-enviar-producao", () => clickButton(/^Enviar para produção/));
  await log("salao", "6-registrar-pagamento", async () => {
    await page.locator('input[name="amount"]').first().fill("15,00", quick);
    await clickButton(/^Registrar pagamento$/);
  });
  // Com pedido ainda em preparo o sistema deve recusar e explicar, sem tela de erro.
  await log("salao", "7-recusar-fechamento-com-pedido-em-preparo", () => clickButton(/^Concluir e liberar mesa$/),
    () => visibleText("Ainda existem pedidos em produção ou não servidos."));

  // 5) Caixa de novo: o que a tela oferece com o caixa aberto e uma venda registrada.
  await log("caixa", "3-com-venda", () => open("/caixa"));
  await log("caixa", "4-conferir-fechar", async () => {
    const expected = await page.getByText("Saldo esperado", { exact: true }).locator("..").locator("strong").innerText(quick);
    await page.locator('input[name="countedCash"]').fill(expected.replace(/[^\d,]/g, ""), quick);
    await clickButton(/^Conferir e fechar turno$/);
  }, () => visibleText("Turno fechado e conferido."));
}

for (const device of DEVICES) {
  const browser = await device.browser.launch();

  // ---------- Painel (local, loja fictícia) ----------
  if (panelBase) {
    const context = await browser.newContext({ ...device.options, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
    const page = await context.newPage();
    // Site institucional e telas de acesso, sem login. "site" em AUDIT_ROUTES pede só este bloco.
    const wantsSite = !process.env.AUDIT_ROUTES || /(^|,)\s*site\s*(,|$)/.test(process.env.AUDIT_ROUTES);
    if (wantsSite && !device.key.endsWith("-escuro")) for (const route of SITE_ROUTES) await audit(page, device, "site", route, `${panelBase}${route}`);
    await audit(page, device, "panel", "login", `${panelBase}/login`);
    try {
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="password"]', password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click('button[type="submit"]')]);
      console.log(`${device.key} logged in → ${page.url()}`);
      await page.waitForTimeout(1200);
      await shotState(page, device, "guia-primeiros-passos");
      const close = page.getByRole("button", { name: "Fechar guia" });
      if (await close.count()) { await close.click(); await page.waitForTimeout(800); }
    } catch (error) {
      results.push({ device: device.key, area: "panel", label: "login-failed", error: String(error.message).slice(0, 300) });
      await shotState(page, device, "login-failed");
    }

    // AUDIT_ROUTES="/pedidos,/pdv" limita às telas do módulo em trabalho; sem ela, percorre todas.
    const chosen = process.env.AUDIT_ROUTES ? process.env.AUDIT_ROUTES.split(",").map((route) => route.trim()).filter((route) => route && route !== "site" && route !== "fluxos" && route !== "plataforma-detalhes") : [...PANEL_ROUTES, ...PLATFORM_ROUTES];
    for (const route of chosen) await audit(page, device, "panel", route, `${panelBase}${route}`);

    // Páginas com id: pega o primeiro link da lista.
    for (const [list, pattern, name] of [["/pedidos", /^\/pedidos\/[0-9a-f-]{36}$/, "/pedidos/[id]"], ["/cardapio/produtos", /^\/cardapio\/produtos\/[0-9a-f-]{36}$/, "/cardapio/produtos/[id]"], ["/clientes", /^\/clientes\/[0-9a-f-]{36}$/, "/clientes/[id]"], ["/salao", /^\/salao\/[0-9a-f-]{36}$/, "/salao/[tableId]"]]) {
      try {
        await page.goto(`${panelBase}${list}`, { waitUntil: "load" });
        await page.waitForFunction((src) => [...document.querySelectorAll("a[href]")].some((a) => new RegExp(src).test(new URL(a.href).pathname)), pattern.source, { timeout: 10000 });
        const href = await page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => new URL(a.href).pathname).find((p) => new RegExp(src).test(p)) || null, pattern.source);
        if (href) await audit(page, device, "panel", name, `${panelBase}${href}`);
        else results.push({ device: device.key, area: "panel", label: name, error: "nenhum link encontrado na lista" });
      } catch (error) { results.push({ device: device.key, area: "panel", label: name, error: String(error.message).slice(0, 200) }); }
    }

    // Telas da plataforma que dependem de empresa, unidade ou pedido: descobre os endereços pelos links das listas.
    if (!process.env.AUDIT_ROUTES || /(^|,)\s*plataforma-detalhes\s*(,|$)/.test(process.env.AUDIT_ROUTES)) {
      const uuid = "[0-9a-f-]{36}";
      const firstLink = async (list, source) => {
        await page.goto(`${panelBase}${list}`, { waitUntil: "load" }).catch(() => {});
        return page.evaluate((src) => [...document.querySelectorAll("a[href]")].map((a) => new URL(a.href).pathname).find((p) => new RegExp(src).test(p)) || null, source).catch(() => null);
      };
      const visit = async (name, href) => { if (href) await audit(page, device, "panel", name, `${panelBase}${href}`); else results.push({ device: device.key, area: "panel", label: name, error: "nenhum link encontrado" }); };
      const organization = await firstLink("/platform", `^/platform/empresas/${uuid}$`);
      await visit("/platform/empresas/[id]", organization);
      await visit("/platform/operacao/pedidos/[id]", await firstLink("/platform/operacao", `^/platform/operacao/pedidos/${uuid}$`));
      const storeLink = (organization ? await firstLink(organization, `^/platform/(empresas/${uuid}/unidades|unidades|restaurantes)/${uuid}$`) : null) ?? await firstLink("/platform", `^/platform/(unidades|restaurantes)/${uuid}$`);
      const storeId = storeLink?.match(new RegExp(`(${uuid})$`))?.[1] ?? null;
      const organizationId = organization?.match(new RegExp(`(${uuid})$`))?.[1] ?? null;
      if (storeId) {
        await visit("/platform/unidades/[id]", `/platform/unidades/${storeId}`);
        await visit("/platform/unidades/[id]/configuracao-operacional", `/platform/unidades/${storeId}/configuracao-operacional`);
        await visit("/platform/unidades/[id]/whatsapp", `/platform/unidades/${storeId}/whatsapp`);
        await visit("/platform/unidades/[id]/whatsapp/notificacoes", `/platform/unidades/${storeId}/whatsapp/notificacoes`);
        await visit("/platform/restaurantes/[id]", `/platform/restaurantes/${storeId}`);
        if (organizationId) await visit("/platform/empresas/[id]/unidades/[id]", `/platform/empresas/${organizationId}/unidades/${storeId}`);
      } else results.push({ device: device.key, area: "panel", label: "/platform/unidades/[id]", error: "nenhuma unidade encontrada nos links" });
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
    // Estes dois só existem no celular.
    if (!device.key.startsWith("pc-")) await openState("/dashboard", ".mobile-more > summary", "menu-mais-aberto");
    await openState("/dashboard", ".app-operation-menu > summary", "menu-loja-aberto");
    await openState("/dashboard", ".app-account-menu > summary", "menu-conta-aberto");
    if (!device.key.startsWith("pc-")) await openState("/pedidos", 'button[aria-label^="Mais ações do pedido"]', "pedidos-menu-acoes");
    try {
      await page.goto(`${panelBase}/pedidos`, { waitUntil: "load" });
      await page.getByRole("button", { name: /^Em preparo/ }).first().click();
      await page.waitForTimeout(500);
      await shotState(page, device, "pedidos-aba-em-preparo");
    } catch (error) { results.push({ device: device.key, area: "state", label: "pedidos-aba", error: String(error.message).slice(0, 200) }); }
    // PDV: venda com item simples, produto com opções e pagamento detalhado. Nada é finalizado.
    {
      const step = async (name, action) => {
        try { await action(); await page.waitForTimeout(600); await shotState(page, device, name); }
        catch (error) { results.push({ device: device.key, area: "state", label: name, error: String(error.message).slice(0, 200) }); }
      };
      const quick = { timeout: 6000 };
      await page.goto(`${panelBase}/pdv`, { waitUntil: "load" }).catch(() => {});
      await page.waitForTimeout(900);
      const measurePdv = () => page.evaluate(() => {
        const describe = (element) => {
          if (!element) return null;
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          const clipping = []; let parent = element.parentElement;
          while (parent && parent !== document.documentElement) {
            const parentStyle = getComputedStyle(parent);
            if (parentStyle.overflowY !== "visible" || parentStyle.overflowX !== "visible" || parentStyle.contain !== "none") clipping.push(`${parent.tagName.toLowerCase()}.${String(parent.className).split(" ")[0].slice(0, 40)} overflow=${parentStyle.overflowX}/${parentStyle.overflowY} h=${Math.round(parent.getBoundingClientRect().height)}`);
            parent = parent.parentElement;
          }
          return { position: style.position, top: style.top, bottom: style.bottom, display: style.display, rect: [Math.round(rect.top), Math.round(rect.bottom), Math.round(rect.height)], clipping };
        };
        const scroller = document.querySelector('main.app-content');
        return { viewport: [innerWidth, innerHeight], scrollY: Math.round(scrollY), contentScrollTop: scroller ? Math.round(scroller.scrollTop) : null, contentPaddingBottom: scroller ? getComputedStyle(scroller).paddingBottom : null, docHeight: document.documentElement.scrollHeight, bar: describe(document.querySelector('footer[aria-label="Pagamento e finalização da venda"]')), switcher: describe(document.querySelector('nav[aria-label="Etapa atual da venda"]')) };
      }).catch((error) => ({ error: String(error.message).slice(0, 200) }));
      await step("pdv-com-item", () => page.locator("button", { hasText: "Coca-Cola 2L" }).first().click(quick));
      results.push({ device: device.key, area: "diag", label: "pdv-layout-itens", pdvLayout: await measurePdv() });
      await step("pdv-produto-opcoes", () => page.locator("button", { hasText: "Caixa com 30 salgados" }).first().click(quick));
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
      if (!device.key.startsWith("pc-")) await step("pdv-venda-no-celular", () => page.locator('nav[aria-label="Etapa atual da venda"] button').nth(1).click(quick));
      await step("pdv-pagamento-detalhes", async () => {
        if (!device.key.startsWith("pc-")) {
          const toggle = page.locator('footer[aria-label="Pagamento e finalização da venda"] button[aria-controls="pdv-checkout-details"]');
          if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click(quick);
        }
        await page.getByRole("button", { name: /Detalhes/ }).first().click(quick);
        await page.getByRole("dialog", { name: "Pagamento", exact: true }).waitFor({ state: "visible", timeout: 10000 });
      });
      // Medidas da barra de pagamento e do seletor de etapa: no celular os dois precisam ficar presos à tela.
      results.push({ device: device.key, area: "diag", label: "pdv-layout-venda", pdvLayout: await measurePdv() });
    }
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
      // Produto sem opções entra no carrinho pelo "+" da própria lista.
      await page.locator('button[aria-label="Adicionar Coca-Cola 2L ao carrinho"]').first().click();
      await page.waitForTimeout(1500);
      await shotState(page, device, "local-depois-de-adicionar");
      await audit(page, device, "public-local", "carrinho", `${panelBase}/m/salgados-da-vila/carrinho`);
      await audit(page, device, "public-local", "checkout", `${panelBase}/m/salgados-da-vila/checkout`);
    } catch (error) { results.push({ device: device.key, area: "state", label: "local-carrinho", error: String(error.message).slice(0, 200) }); }
    // ---------- Fluxos de ponta a ponta (só computador, tema claro). Alteram dados da loja fictícia: ficam por último.
    if (device.key === "pc-1366" && /(^|,)\s*fluxos\s*(,|$)/.test(process.env.AUDIT_ROUTES ?? "")) {
      try { await runFlows(page, device); }
      catch (error) { results.push({ device: device.key, area: "fluxo", label: "fluxos-interrompidos", ok: false, error: String(error.message).slice(0, 300) }); }
    }
    await context.close();
  }

  await browser.close();
}

await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify(results, null, 1));
console.log(`UX2_AUDIT_DONE entries=${results.length}`);
const failures = auditFailures(results);
await fs.writeFile(path.join(outDir, "failures.json"), JSON.stringify(failures, null, 2));
if (failures.length) {
  console.error(`UX2_AUDIT_FAILED ${JSON.stringify(failures)}`);
  process.exitCode = 1;
}
