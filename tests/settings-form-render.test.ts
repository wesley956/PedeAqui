import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import StoreProfileSettingsPage from "@/app/(app)/configuracoes/loja/page";
import StoreHoursPage from "@/app/(app)/configuracoes/horarios/page";
import DeliverySettingsPage from "@/app/(app)/configuracoes/entrega/page";
import pageStyles from "@/app/(app)/configuracoes/settings-form.module.css";
import controlStyles from "@/components/ui/form-controls.module.css";
import buttonStyles from "@/components/ui/button.module.css";

const fixtures = vi.hoisted(() => ({
  empty: false,
  profile: { name: "Loja de teste", slug: "loja-de-teste", phone: "19999990000", email: "teste@example.com", postal_code: "13460000", street: "Rua de teste", number: "10", complement: "", district: "Centro", city: "Nova Odessa", state: "SP", public_whatsapp: "", website_url: "", instagram_url: "", facebook_url: "", tiktok_url: "" },
  hours: [{ id: "hour-a", weekday: 5, opens_at: "21:00:00", closes_at: "01:00:00", closes_next_day: true }],
  settings: { fee_mode: "neighborhood", default_fee_cents: 500, free_delivery_over_cents: null, estimated_min_minutes: 30, estimated_max_minutes: 60, enabled: false, require_neighborhood_match: true },
  neighborhoods: ["bairro-a", "bairro-b"].map((id, i) => ({ id, neighborhood_name: `Jardim de teste ${id}`, city: "Nova Odessa", state: "SP", fee_cents: 550 + i * 100, minimum_order_cents: i ? 2000 : null, additional_minutes: i ? 5 : 0, active: !i })),
}));
vi.mock("@/server/stores/store-profile-service", () => ({ StoreProfileService: { getProfile: vi.fn(async () => fixtures.profile) } }));
vi.mock("@/server/menu/store-menu-service", () => ({ StoreMenuService: { listHours: vi.fn(async () => fixtures.empty ? [] : fixtures.hours) } }));
vi.mock("@/server/delivery/delivery-service", () => ({ DeliveryService: { getSettings: vi.fn(async () => fixtures.settings), listNeighborhoods: vi.fn(async () => fixtures.empty ? [] : fixtures.neighborhoods) } }));
vi.mock("@/server/delivery/driver-history-policy-service", () => ({ DriverHistoryPolicyService: { get: vi.fn(async () => false) } }));
vi.mock("@/features/stores/actions", () => ({ saveStoreProfileAction: vi.fn() }));
vi.mock("@/features/menu/actions", () => ({ addStoreHourAction: vi.fn(), removeStoreHourAction: vi.fn() }));
vi.mock("@/features/delivery/actions", () => ({ createDeliveryNeighborhoodAction: vi.fn(), removeDeliveryNeighborhoodAction: vi.fn(), saveDeliverySettingsAction: vi.fn(), toggleDeliveryNeighborhoodAction: vi.fn() }));
vi.mock("@/features/delivery/neighborhood-actions", () => ({ updateDeliveryNeighborhoodAction: vi.fn() }));
vi.mock("@/features/delivery/driver-history-actions", () => ({ saveDriverHistoryVisibilityAction: vi.fn() }));

function idsAreUnique(html: string) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const [, id] of html.matchAll(/\sfor="([^"]+)"/g)) expect(ids).toContain(id);
}
function labeledForm(html: string, label: string) {
  const form = [...html.matchAll(/<form([^>]*)>(.*?)<\/form>/gs)].find((m) => m[1]?.includes(`aria-label="${label}"`));
  if (!form?.[2]) throw new Error(`Missing form ${label}`);
  return form[2];
}
function exportFixture(name: string, html: string) {
  const directory = process.env.PEDEAQUI_SETTINGS_QA_DIR;
  if (!directory) return;
  const sources: Array<[string, Record<string, string>]> = [["src/app/(app)/configuracoes/settings-form.module.css", pageStyles], ["src/components/ui/form-controls.module.css", controlStyles], ["src/components/ui/button.module.css", buttonStyles]];
  const css = readFileSync("src/app/globals.css", "utf8") + sources.map(([path, mapping]) => readFileSync(path, "utf8").replace(/\.([a-zA-Z_][\w-]*)/g, (token, key: string) => mapping[key] ? `.${mapping[key]}` : token)).join("\n");
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/${name}.html`, `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px}main{max-width:1100px;margin:auto}</style><main>${html}</main></html>`);
}
describe("settings editors preserve the existing server form contracts", () => {
  afterEach(() => { fixtures.empty = false; });
  it("keeps profile values and optional public contacts in one form without editing the public slug", async () => {
    const html = renderToStaticMarkup(await StoreProfileSettingsPage());
    idsAreUnique(html);
    const form = labeledForm(html, "Dados da loja");
    for (const name of ["name", "phone", "email", "postalCode", "street", "number", "complement", "district", "city", "state", "publicWhatsapp", "websiteUrl", "instagramUrl", "facebookUrl", "tiktokUrl"]) expect(form).toContain(`name="${name}"`);
    expect(form).toContain('value="Loja de teste"');
    expect(form).not.toContain('name="slug"');
    expect(html).toContain('href="/m/loja-de-teste"');
    exportFixture("store-profile", html);
  });
  it("retains explicit overnight scheduling and targeted period removal", async () => {
    const html = renderToStaticMarkup(await StoreHoursPage());
    idsAreUnique(html);
    const form = labeledForm(html, "Adicionar período");
    for (const name of ["weekday", "opensAt", "closesAt", "sortOrder", "closesNextDay"]) expect(form).toContain(`name="${name}"`);
    expect(html).toContain("21:00 → 01:00 (+1 dia)");
    expect(html).toContain('name="hourId" value="hour-a"');
    exportFixture("store-hours", html);
  });
  it("preserves disabled delivery and neighborhoods while keeping the history policy independent", async () => {
    const html = renderToStaticMarkup(await DeliverySettingsPage());
    idsAreUnique(html);
    const form = labeledForm(html, "Regras da entrega");
    expect(form).toContain('value="neighborhood" selected=""');
    expect(form).toContain('value="5,00"');
    expect(form).not.toMatch(/<input(?=[^>]*name="enabled")(?=[^>]*checked="")[^>]*>/);
    expect(form).not.toContain('name="driverHistoryVisible"');
    const policy = labeledForm(html, "Histórico do entregador");
    expect(policy).toContain('name="driverHistoryVisible"');
    expect(policy).not.toContain('name="feeMode"');
    expect(html).toContain("Jardim de teste bairro-a");
    expect(html).toContain("Jardim de teste bairro-b");
    exportFixture("delivery-settings", html);
  });
  it("keeps each neighborhood identifier, price, minimum and extra minutes in its own editor", async () => {
    const html = renderToStaticMarkup(await DeliverySettingsPage());
    for (const row of fixtures.neighborhoods) {
      const form = labeledForm(html, `Editar bairro ${row.neighborhood_name}`);
      expect(form).toContain(`name="neighborhoodId" value="${row.id}"`);
      for (const name of ["neighborhoodName", "city", "state", "fee", "minimumOrder", "additionalMinutes"]) expect(form).toContain(`name="${name}"`);
      expect(form).toContain(`value="${(row.fee_cents / 100).toFixed(2).replace(".", ",")}"`);
    }
  });
  it("renders useful empty lists without removing the creation forms", async () => {
    fixtures.empty = true;
    const delivery = renderToStaticMarkup(await DeliverySettingsPage());
    expect(delivery).toContain("Nenhum bairro cadastrado");
    expect(labeledForm(delivery, "Adicionar bairro")).toContain('name="fee"');
    const hours = renderToStaticMarkup(await StoreHoursPage());
    expect(hours).toContain("Nenhum horário cadastrado");
    expect(labeledForm(hours, "Adicionar período")).toContain('name="opensAt"');
  });
});
