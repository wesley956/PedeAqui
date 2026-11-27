import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Mutations are strictly limited to the local synthetic fixture database.
const base = new URL(process.env.BASE_URL);
const database = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
assert.equal(base.hostname, "127.0.0.1");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "54321");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(key);
const out = path.join(process.cwd(), "artifacts/browser-homologation");
await fs.mkdir(out, { recursive: true });
const eventId = "bc000000-0000-4000-8000-000000000031";
const storeId = "bc000000-0000-4000-8000-000000000012";
const slug = "browser-event-closed";
const productId = "bc000000-0000-4000-8000-000000000022";
const reason = "Equipe em evento de demonstração";
const results = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
async function patch(table, filter, values) {
  const response = await fetch(new URL(`/rest/v1/${table}?${filter}`, database), {
    method: "PATCH",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(values),
  });
  assert.ok(response.ok, `Fixture patch ${table}: HTTP ${response.status}`);
  assert.equal((await response.json()).length, 1, "Exactly one synthetic fixture row must change");
}
async function visit(route) {
  const response = await page.goto(new URL(route, base).href, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `HTTP for ${route}`);
}
async function menuOpen() {
  await visit(`/m/${slug}`);
  assert.ok(await page.getByText("Aberto agora", { exact: true }).isVisible());
  assert.equal(await page.getByText(reason, { exact: false }).count(), 0);
}
try {
  await visit("/m/browser-demo");
  assert.ok(await page.getByText("Aberto agora", { exact: true }).isVisible());
  results.push("another store in the same organization remains open");

  await visit(`/m/${slug}`);
  assert.ok(await page.getByRole("status").filter({ hasText: reason }).isVisible());
  await page.screenshot({ path: path.join(out, "event-closed-menu-390.png"), fullPage: true });
  await visit(`/m/${slug}/produto/${productId}`);
  assert.ok(await page.getByRole("button", { name: "Pedidos pausados", exact: true }).isDisabled());
  assert.ok(await page.getByRole("status").filter({ hasText: reason }).isVisible());
  results.push("active event displays its reason and blocks product purchase");

  await patch("pdv_events", `id=eq.${eventId}`, { status: "closed" });
  await menuOpen();
  await visit(`/m/${slug}/produto/${productId}`);
  assert.ok(await page.getByRole("button", { name: /^Adicionar\s+R\$/ }).isEnabled());
  results.push("closing the event restores the existing store hours and product purchase");

  const manualReason = "Pausa manual da fixture";
  await patch("store_menu_settings", `store_id=eq.${storeId}`, { accepting_orders: false, pause_reason: manualReason, paused_at: new Date().toISOString() });
  await patch("pdv_events", `id=eq.${eventId}`, { status: "active" });
  await visit(`/m/${slug}`);
  assert.ok(await page.getByRole("status").filter({ hasText: reason }).isVisible());
  await patch("pdv_events", `id=eq.${eventId}`, { status: "closed" });
  await visit(`/m/${slug}`);
  assert.ok(await page.getByRole("status").filter({ hasText: manualReason }).isVisible());
  results.push("event closure never clears an independent manual pause");

  await patch("store_menu_settings", `store_id=eq.${storeId}`, { accepting_orders: true, pause_reason: null, paused_at: null });
  await patch("pdv_events", `id=eq.${eventId}`, {
    status: "active",
    closure_starts_at: new Date(Date.now() - 7200_000).toISOString(),
    closure_ends_at: new Date(Date.now() - 3600_000).toISOString(),
  });
  await menuOpen();
  results.push("expired event closure restores normal operation without editing store settings");
  assert.deepEqual(pageErrors, []);
  console.log("PUBLIC_EVENT_CLOSURE=passed");
} finally {
  await fs.writeFile(path.join(out, "event-store-closure.json"), JSON.stringify({ results, pageErrors }, null, 2));
  await browser.close();
}
