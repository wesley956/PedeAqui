import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import PaymentSettingsPage from "@/app/(app)/configuracoes/pagamentos/page";
import ConversationSettingsPage from "@/app/(app)/configuracoes/conversas/page";
import OrderWorkflowSettingsPage from "@/app/(app)/configuracoes/fluxo-pedidos/page";
import PrintingSettingsPage from "@/app/(app)/configuracoes/impressoes/page";
import PrintFormatPage from "@/app/(app)/configuracoes/impressoes/formato/page";
import ManagePrinterConnectionsPage from "@/app/(app)/configuracoes/impressoes/gerenciar/page";
import { resolveOrderPrintPreferences } from "@/server/printing/templates";
import pageStyles from "@/app/(app)/configuracoes/settings-form.module.css";
import controlStyles from "@/components/ui/form-controls.module.css";
import buttonStyles from "@/components/ui/button.module.css";
import workflowStyles from "@/features/orders/workflow-settings.module.css";
import automationStyles from "@/features/conversations/automation-settings.module.css";
import printStyles from "@/app/(app)/configuracoes/impressoes/printing.module.css";
import formatStyles from "@/app/(app)/configuracoes/impressoes/formato/format.module.css";

const fixture = vi.hoisted(() => ({ connected: false, infinitePay: false, empty: false, manage: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["host", "teste.example.com"]]) }));
vi.mock("@/server/access/authorize", () => ({ authorize: vi.fn(async () => ({ storeId: "store-test" })) }));
vi.mock("@/server/access/navigation-access-service", () => ({ NavigationAccessService: { load: async () => ({ permissionKeys: fixture.manage ? ["printing.manage"] : [] }) } }));
vi.mock("@/server/payments/store-payment-method-service", () => ({ StorePaymentMethodService: {
  listCurrentStore: async () => [{ method: "cash", enabled: true }, { method: "pix", enabled: false }],
  listCustomCurrentStore: async () => fixture.empty ? [] : [{ id: "custom-a", name: "Benefício de teste", enabled: false }, { id: "custom-b", name: "Voucher de teste", enabled: true }],
} }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({ OrderPaymentProviderConfigService: { getCurrentStore: async () => ({ context: { storeId: "store-test" }, infinitepay: fixture.infinitePay ? { credentialsConfigured: true, enabled: false, providerAccountId: "dona-maria", healthStatus: "unknown" } : null, config: fixture.connected ? { connectionMode: "oauth", credentialsConfigured: true, enabled: false, providerAccountId: "fake-1234", healthStatus: "healthy" } : null }) } }));
vi.mock("@/server/payments/providers/mercado-pago-oauth", () => ({ isMercadoPagoOAuthConfigured: () => true }));
vi.mock("@/features/payments/actions", () => ({ addCustomPaymentMethodAction: vi.fn(), archiveCustomPaymentMethodAction: vi.fn(), disconnectMercadoPagoOAuthAction: vi.fn(), renameCustomPaymentMethodAction: vi.fn(), saveOnlinePixProviderAction: vi.fn(), savePaymentMethodsAction: vi.fn(), saveInfinitePayAction: vi.fn(), toggleInfinitePayAction: vi.fn(), disconnectInfinitePayAction: vi.fn(), toggleCustomPaymentMethodAction: vi.fn(), toggleOnlinePixProviderAction: vi.fn() }));
vi.mock("@/server/conversations/settings-service", () => ({ ConversationSettingsService: { load: async () => ({ whatsapp_phone_number_id: fixture.connected ? "fake-number" : null, access_token_secret_ref: "fake-ref", app_secret_secret_ref: "fake-ref", whatsapp_enabled: false, order_notification_template_name: "fake_template", order_notification_template_language: "pt_BR", default_bot_enabled: true, bot_auto_close_minutes: 35, human_auto_close_minutes: 65, handoff_message: "Texto de teste preservado" }) } }));
vi.mock("@/server/conversations/meta-embedded-signup-service", () => ({ MetaEmbeddedSignupService: { publicConfig: () => ({ ready: false }), currentStatus: async () => ({ connection_status: "disconnected", onboarding_status: "not_started", whatsapp_enabled: false, connection_mode: "cloud_api", display_phone_number: null }) } }));
vi.mock("@/features/conversations/meta-embedded-signup-actions", () => ({ completeWhatsAppEmbeddedSignupAction: vi.fn(), disconnectWhatsAppAction: vi.fn(), getWhatsAppEmbeddedSignupBrowserConfigAction: vi.fn(), startWhatsAppEmbeddedSignupAction: vi.fn() }));
vi.mock("@/features/conversations/settings-actions", () => ({ saveConversationSettingsAction: vi.fn() }));
vi.mock("@/server/conversations/whatsapp-automation-capability-service", () => ({ WhatsAppAutomationCapabilityService: { loadCurrentStore: async () => ({}) } }));
vi.mock("@/server/conversations/whatsapp-automation-capability", () => ({ resolveWhatsAppAutomationCapabilities: () => Object.fromEntries(["order_received", "order_confirmed", "production_preparing", "payment_paid", "pickup_ready", "pickup_completed", "out_for_delivery", "delivered", "order_canceled"].map(key => [key, { label: key, description: "Etapa de teste", configurable: true, state: "suspended_channel", triggerLabel: "Evento real" }])) }));
vi.mock("@/server/conversations/whatsapp-operational-health-service", () => ({ WhatsAppOperationalHealthService: { load: async () => ({ state: "disconnected", timezone: "America/Sao_Paulo", connection: { enabled: false, status: "disconnected", mode: "cloud_api" }, webhook: {}, activity: { lastInboundAt: null, waitingAgentCount: 0 }, queues: { outboundPending: 0, mediaPending: 0, outboundFailedRecent: 0, mediaFailedRecent: 0 }, recentFailureWindowHours: 24, issues: [] }) } }));
vi.mock("@/features/orders/workflow-settings-actions", () => ({ saveOrderWorkflowSettingsAction: vi.fn() }));
vi.mock("@/server/orders/order-workflow-settings-service", () => ({ OrderWorkflowSettingsService: { get: async () => ({ settings: { mode: "custom", custom: { delivery: ["new", "ready", "finished"], pickup: ["new", "finished"], quickFinish: false } } }) } }));
vi.mock("@/server/printing/print-line-spacing-service", () => ({ PrintLineSpacingService: { get: async () => "comfortable" } }));
vi.mock("@/features/printing/actions", () => ({ requestAgentDiagnosticAction: vi.fn(), cancelAgentDiagnosticAction: vi.fn(), createPrintAgentAction: vi.fn(), reconnectPrintAgentAction: vi.fn(), cancelPrintJobAction: vi.fn(), createPrinterAction: vi.fn(), createPrintStationAction: vi.fn(), enqueuePrinterTestAction: vi.fn(), linkProductStationAction: vi.fn(), linkStationPrinterAction: vi.fn(), quickSetupDetectedPrinterAction: vi.fn(), reprintJobAction: vi.fn(), retryPrintJobAction: vi.fn(), saveOrderPrintPreferencesAction: vi.fn(), updatePrinterCopiesAction: vi.fn() }));
vi.mock("@/features/printing/connection-actions", () => ({ setPrinterActiveAction: vi.fn(), unlinkPrinterAction: vi.fn() }));
vi.mock("@/features/printing/agent-actions", () => ({ createPrintAgentTokenAction: vi.fn(), createPrintAgentReconnectTokenAction: vi.fn() }));
vi.mock("@/server/printing/print-config-service", () => ({ PrintConfigService: { snapshot: async () => ({
  printers: fixture.empty ? [] : [{ id: "printer-a", name: "Impressora de teste", agent_id: "agent-a", connection_type: "system", connection_address: "Impressora de teste", active: true, status: "unknown", last_seen_at: null, paper_width_mm: 80, default_copies: 2 }],
  agents: fixture.empty ? [] : [{ id: "agent-a", name: "Computador de teste", active: true, status: "unknown", last_seen_at: null, capabilities: { discoveredPrinters: [{ name: "Impressora de teste", isDefault: true }] } }],
  stations: fixture.empty ? [] : [{ id: "station-a", name: "Cozinha de teste", kind: "production", active: true }],
  stationPrinters: fixture.empty ? [] : [{ station_id: "station-a", printer_id: "printer-a", priority: 100, copies: 3, active: true }], productStations: [], products: [{ id: "product-a", name: "Produto de teste" }], categories: [], printPreferences: resolveOrderPrintPreferences(null),
}) } }));
vi.mock("@/server/printing/print-agent-diagnostic-service", () => ({ PrintAgentDiagnosticService: { list: async () => [] } }));
vi.mock("@/server/printing/print-monitor-service", () => ({ PrintMonitorService: { current: async () => ({ jobs: fixture.empty ? [] : [{ id: "job-a", status: "failed", display_number: 128, document_type: "kitchen", station_id: "station-a", printer_id: "printer-a", copies: 2, last_error: "fake" }] }) } }));

function forms(html: string) { return [...html.matchAll(/<form([^>]*)>(.*?)<\/form>/gs)].map(m => ({ attributes: m[1]!, body: m[2]! })); }
function form(html: string, label: string) { const found = forms(html).find(f => f.attributes.includes(`aria-label="${label}"`)); expect(found).toBeDefined(); return found!.body; }
function exportFixture(name: string, html: string) {
  const dir = process.env.PEDEAQUI_OPERATION_QA_DIR; if (!dir) return;
  const sources: Array<[string, Record<string, string>]> = [["src/app/(app)/configuracoes/settings-form.module.css",pageStyles],["src/components/ui/form-controls.module.css",controlStyles],["src/components/ui/button.module.css",buttonStyles],["src/features/orders/workflow-settings.module.css",workflowStyles],["src/features/conversations/automation-settings.module.css",automationStyles],["src/app/(app)/configuracoes/impressoes/printing.module.css",printStyles],["src/app/(app)/configuracoes/impressoes/formato/format.module.css",formatStyles]];
  const css = readFileSync("src/app/globals.css","utf8") + sources.map(([path,map]) => readFileSync(path,"utf8").replace(/\.([a-zA-Z_][\w-]*)/g,(token,key:string) => map[key] ? `.${map[key]}` : token)).join("\n");
  mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/${name}.html`,`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px}main{max-width:1100px;margin:auto}</style><main>${html}</main></html>`);
}
describe("operation settings retain isolated saves and mounted configuration fields", () => {
  afterEach(() => { fixture.connected=false;fixture.infinitePay=false;fixture.empty=false;fixture.manage=true; });
  it("keeps payment names, activation, archive and manual credentials in independent forms",async () => {
    const html=renderToStaticMarkup(await PaymentSettingsPage({searchParams:Promise.resolve({})}));
    expect(form(html,"Formas aceitas")).not.toContain('name="accessToken"');
    expect(form(html,"Adicionar forma personalizada")).toContain('name="name"');
    // Pagamentos em duas abas: a configuração manual do Pix fica na aba "Pix online".
    expect(html).not.toContain('name="accessToken"');
    const online=renderToStaticMarkup(await PaymentSettingsPage({searchParams:Promise.resolve({aba:"online"})}));
    for(const name of ["environment","accessToken","webhookSecret","enabled"]) expect(form(online,"Configuração manual do Pix")).toContain(`name="${name}"`);
    expect(online).not.toContain('aria-label="Formas aceitas"');
    for(const id of ["custom-a","custom-b"]) expect(html).toContain(`name="id" value="${id}"`);
    expect(form(html,"Renomear Benefício de teste")).toContain('value="Benefício de teste"');
    const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);expect(new Set(ids).size).toBe(ids.length);
    exportFixture("payments-manual",html);
  });
  it("keeps OAuth connection distinct from Pix activation with no manual credential editor",async () => {
    fixture.connected=true;const html=renderToStaticMarkup(await PaymentSettingsPage({searchParams:Promise.resolve({mercado_pago:"connected"})}));
    expect(html).toContain("Conectado, Pix desativado");expect(html).not.toContain('name="accessToken"');expect(html).toContain("Salvar ativação do Pix");
    expect(forms(html).find(f => f.body.includes("Salvar ativação do Pix"))!.body).not.toMatch(/<input(?=[^>]*name="enabled")(?=[^>]*checked="")[^>]*>/);
    exportFixture("payments-oauth",html);
  });
  it("keeps InfinitePay connection separate from activation without exposing any stored API key", async () => {
    fixture.infinitePay=true;
    const html=renderToStaticMarkup(await PaymentSettingsPage({ searchParams: Promise.resolve({ aba: "online" }) }));
    const connection=form(html,"Conectar InfinitePay");
    expect(connection).toContain('name="handle"');
    expect(connection).toContain('value="dona-maria"');
    expect(connection).toContain('type="password"');
    expect(connection).not.toContain('name="enabled"');
    expect(html).toContain("Conectada, desativada");
    expect(forms(html).find(f => f.body.includes("Salvar ativação da InfinitePay"))!.body).not.toMatch(/<input(?=[^>]*name="enabled")(?=[^>]*checked="")[^>]*>/);
    exportFixture("payments-infinitepay", html);
  });
  it("keeps all WhatsApp groups inside the original single preferences form",async () => {
    fixture.connected=true;const html=renderToStaticMarkup(await ConversationSettingsPage());const body=form(html,"Preferências do WhatsApp");
    for(const name of ["whatsappEnabled","botEnabled","aiEnabled","botMenuMode","botDisplayName","greetingTemplate","greetingFallbackMessage","handoffMessage","unknownMessage","conversationAutoCloseEnabled","botAutoCloseMinutes","humanAutoCloseMinutes","autoCloseMessage","orderNotificationTemplateName","orderNotificationTemplateLanguage","orderNotificationText_order_received"]) expect(body).toContain(`name="${name}"`);
    expect(body).toContain("Texto de teste preservado");expect(body).toContain('value="35"');expect(body).toContain('value="65"');expect(body).not.toContain("<form");
    expect(body).toContain('aria-label="Texto do aviso: order_received"');exportFixture("whatsapp",html);
  });
  it("retains locked workflow checkpoints as hidden successful controls",async () => {
    const html=renderToStaticMarkup(await OrderWorkflowSettingsPage());
    for(const lane of ["delivery","pickup"]) for(const stage of ["new","finished"]) expect(html).toContain(`type="hidden" name="${lane}:${stage}" value="on"`);
    expect(html).toMatch(/<input(?=[^>]*name="mode")(?=[^>]*value="custom")(?=[^>]*checked="")[^>]*>/);expect(html).toContain('name="quickFinish"');exportFixture("workflow",html);
  });
  it("preserves manual printing, destinations and targeted queue actions",async () => {
    const html=renderToStaticMarkup(await PrintingSettingsPage({searchParams:Promise.resolve({})}));const manual=form(html,"Adicionar impressora manualmente");
    for(const name of ["name","connectionType","connectionAddress","connectionPort","paperWidthMm","defaultCopies","agentId","fallbackPrinterId"]) expect(manual).toContain(`name="${name}"`);
    expect(form(html,"Adicionar local de impressão")).toContain('pattern="[a-z0-9][a-z0-9_-]{1,39}"');
    expect(html).toContain('name="jobId" value="job-a"');expect(html).toContain('aria-label="Motivo da reimpressão do pedido #128"');exportFixture("printing",html);
  });
  it("retains independent default and per-station copies plus printer unlink confirmation",async () => {
    const format=renderToStaticMarkup(await PrintFormatPage());expect(format).toContain('name="defaultCopies"');expect(format).toContain('name="copies"');expect(format).toContain('name="priority" value="100"');exportFixture("print-format",format);
    const manage=renderToStaticMarkup(await ManagePrinterConnectionsPage({searchParams:Promise.resolve({})}));expect(manage).toContain('name="printerId" value="printer-a"');expect(manage).toMatch(/<input(?=[^>]*name="confirmUnlink")(?=[^>]*required="")[^>]*>/);exportFixture("print-manage",manage);
  });
  it("renders empty integrations and read-only printing without enabling controls",async () => {
    fixture.empty=true;fixture.manage=false;const format=renderToStaticMarkup(await PrintFormatPage());expect(format).not.toContain("<form action");expect(format).toContain("somente quem administra impressão");
    const printing=renderToStaticMarkup(await PrintingSettingsPage({searchParams:Promise.resolve({})}));expect(printing).toContain("Nenhuma impressão na fila");expect(form(printing,"Adicionar impressora manualmente")).toContain('name="name"');
  });
});
