import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, devices } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const baseUrl = (process.env.BASE_URL || "https://pedeaqui.pp.ua").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.HOMOLOGATION_EMAIL || "aweservicosaw@gmail.com";
const demoSlug = process.env.DEMO_SLUG || "santa-rita";
if (!supabaseUrl || !publishableKey || !serviceRoleKey) throw new Error("Supabase homologation credentials unavailable");

const outDir = path.join(process.cwd(), "artifacts", "authenticated-browser-homologation");
await fs.mkdir(outDir, { recursive: true });
const results = [];
const failures = [];
const criticalImpact = new Set(["critical", "serious"]);
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: demoStore, error: storeError } = await admin.from("stores").select("id,organization_id,name,slug,module_config_revision,updated_at").eq("platform_demo", true).eq("slug", demoSlug).single();
if (storeError || !demoStore) throw storeError || new Error("Demo store not found");

async function authCookies() {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data?.properties?.hashed_token) throw error || new Error("Magic link generation failed");
  const written = new Map();
  const auth = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() { return []; },
      setAll(values) { for (const item of values) written.set(item.name, item.value); },
    },
  });
  const verified = await auth.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (verified.error || !verified.data.session) throw verified.error || new Error("Magic link verification failed");
  return [...written].filter(([, value]) => value).map(([name, value]) => ({ name, value, url: baseUrl }));
}

function safeName(value) { return value.replace(/[^a-z0-9._-]+/gi, "-"); }
async function audit(page, label, url, screenshot = true) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(700);
  const status = response?.status() || 0;
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    title: document.title,
    h1: document.querySelector("h1")?.textContent?.trim() || null,
    focusable: document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])').length,
  }));
  if (status >= 400 || status === 0) failures.push(`${label}: HTTP ${status}`);
  if (page.url().includes("/login")) failures.push(`${label}: redirected to login`);
  if (metrics.scrollWidth > metrics.width + 2) failures.push(`${label}: horizontal overflow ${metrics.scrollWidth}>${metrics.width}`);
  const axe = await new AxeBuilder({ page }).analyze();
  const violations = axe.violations.filter((x) => criticalImpact.has(x.impact)).map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.length }));
  if (violations.length) failures.push(`${label}: axe ${JSON.stringify(violations)}`);
  if (screenshot) await page.screenshot({ path: path.join(outDir, `${safeName(label)}.png`), fullPage: true });
  results.push({ label, url, effectiveUrl: page.url(), status, ...metrics, violations });
}

const cookies = await authCookies();
const routes = [
  ["dashboard", "/dashboard"], ["orders", "/pedidos"], ["catalog", "/cardapio/produtos"],
  ["deliveries", "/entregas"], ["settings", "/configuracoes"], ["finance", "/financeiro"],
  ["platform", "/platform"], ["support", "/platform/suporte/modo"],
];

async function runChromium() {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 1000]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      await context.addCookies(cookies);
      for (const [name, route] of routes) await audit(await context.newPage(), `auth-${name}-${width}x${height}`, `${baseUrl}${route}`, width !== 768);
      await context.close();
    }

    const zoomContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await zoomContext.addCookies(cookies);
    for (const percent of [80, 100, 125, 150, 200]) {
      const page = await zoomContext.newPage();
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.evaluate((value) => { document.documentElement.style.zoom = `${value}%`; }, percent);
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
      if (m.scrollWidth > m.width + 2) failures.push(`zoom-${percent}: horizontal overflow ${m.scrollWidth}>${m.width}`);
      await page.screenshot({ path: path.join(outDir, `zoom-dashboard-${percent}.png`), fullPage: true });
      results.push({ label: `zoom-dashboard-${percent}`, ...m });
      await page.close();
    }
    await zoomContext.close();

    const supportContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await supportContext.addCookies(cookies);
    const page = await supportContext.newPage();
    await page.goto(`${baseUrl}/platform/suporte/modo`, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (page.url().includes("/login")) throw new Error("Support mode redirected to login");
    const protocol = `HOMO-462-${Date.now()}`;
    await page.selectOption('select[name="organizationId"]', demoStore.organization_id);
    await page.selectOption('select[name="storeId"]', demoStore.id);
    await page.fill('input[name="reason"]', "Homologação controlada da issue 462");
    await page.fill('input[name="protocol"]', protocol);
    await page.getByRole("button", { name: /Iniciar sessão temporária/i }).click();
    await page.waitForLoadState("domcontentloaded");
    await page.getByText("MODO SUPORTE · SOMENTE LEITURA").waitFor();
    const writableControls = await page.locator('input,select,textarea').count();
    const actionButtons = await page.getByRole("button").allTextContents();
    if (writableControls !== 0) failures.push(`support-mode: unexpected writable controls=${writableControls}`);
    if (actionButtons.some((x) => !/Encerrar modo suporte/i.test(x))) failures.push(`support-mode: unexpected action buttons ${JSON.stringify(actionButtons)}`);
    await page.screenshot({ path: path.join(outDir, "support-mode-read-only.png"), fullPage: true });

    const before = await admin.from("stores").select("module_config_revision,updated_at").eq("id", demoStore.id).single();
    const directWrite = await supportContext.request.post(`${baseUrl}/platform/suporte/modo`, { form: { storeId: demoStore.id, operation: "write" } });
    const after = await admin.from("stores").select("module_config_revision,updated_at").eq("id", demoStore.id).single();
    if (directWrite.status() < 400) failures.push(`support-mode: direct POST unexpectedly returned ${directWrite.status()}`);
    if (JSON.stringify(before.data) !== JSON.stringify(after.data)) failures.push("support-mode: store changed after unauthorized direct POST");

    await page.getByRole("button", { name: /Encerrar modo suporte/i }).click();
    await page.waitForLoadState("domcontentloaded");
    const { data: audits, error: auditError } = await admin.from("audit_logs").select("action,request_id").eq("request_id", protocol).in("action", ["platform.support_mode.started", "platform.support_mode.ended"]);
    if (auditError) throw auditError;
    const started = (audits || []).filter((x) => x.action === "platform.support_mode.started").length;
    const ended = (audits || []).filter((x) => x.action === "platform.support_mode.ended").length;
    if (started !== 1 || ended !== 1) failures.push(`support-mode audit mismatch started=${started} ended=${ended}`);
    results.push({ label: "support-mode-real", protocol, writableControls, actionButtons, directPostStatus: directWrite.status(), started, ended });
    await supportContext.close();
  } finally { await browser.close(); }
}

async function runCompatibility() {
  const cases = [
    ["android", chromium, devices["Pixel 7"]],
    ["safari", webkit, devices["Desktop Safari"]],
    ["iphone", webkit, devices["iPhone 14"]],
  ];
  for (const [name, type, device] of cases) {
    const browser = await type.launch();
    try {
      const context = await browser.newContext({ ...device });
      await context.addCookies(cookies);
      const page = await context.newPage();
      await audit(page, `auth-${name}-dashboard`, `${baseUrl}/dashboard`);
      await page.keyboard.press("Tab");
      const visibleFocus = await page.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (!visibleFocus) failures.push(`${name}: no visible keyboard focus`);
      results.push({ label: `auth-${name}-keyboard-focus`, visibleFocus });
      await context.close();
    } finally { await browser.close(); }
  }
}

try { await runChromium(); await runCompatibility(); } catch (error) { failures.push(error instanceof Error ? error.stack || error.message : String(error)); }
await fs.writeFile(path.join(outDir, "results.json"), JSON.stringify({ baseUrl, demoSlug, results, failures }, null, 2));
await fs.writeFile(path.join(outDir, "summary.md"), ["# Authenticated browser homologation", "", `- Checks: ${results.length}`, `- Failures: ${failures.length}`, "", ...failures.map((x) => `- ❌ ${x}`)].join("\n"));
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`Authenticated browser homologation passed with ${results.length} checks.`);
