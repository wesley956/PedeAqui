import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commercialSurfaces = [
  "src/app/(app)/configuracoes/page.tsx",
  "src/app/(app)/configuracoes/conversas/page.tsx",
  "src/app/(app)/configuracoes/impressoes/page.tsx",
  "src/app/(app)/configuracoes/pagamentos/page.tsx",
  "src/app/(app)/crescimento/page.tsx",
  "src/features/printing/agent-token-creator.tsx",
  "src/features/orders/actions.ts",
];

const forbiddenVisibleSnippets = [
  "fonte de verdade",
  "Provider, webhook",
  "Phone Number ID",
  "Business Account ID",
  "Variável do access token",
  "Variável do App Secret",
  "variáveis de ambiente",
  "Graph API ",
  "service role",
  "allowlist de ferramentas",
  "adaptador futuro",
  "executor diário",
  "Print Agent",
  "fila persistente",
  "Cloud Agent",
  "futuro driver",
  "Pagamento confirmado no ledger",
  "digital_menu / pdv",
  "JSON.stringify(segment.rules)",
  "processamento online entra em etapa futura",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_GRAPH_API_VERSION",
];

describe("commercial language guard", () => {
  it.each(commercialSurfaces)("keeps %s free of internal implementation copy", (path) => {
    const source = readFileSync(path, "utf8");
    for (const snippet of forbiddenVisibleSnippets) {
      expect(source, `${path} still exposes: ${snippet}`).not.toContain(snippet);
    }
  });

  it("does not expose raw provider/database errors from interactive order and print actions", () => {
    const orderActions = readFileSync("src/features/orders/actions.ts", "utf8");
    const printActions = readFileSync("src/features/printing/actions.ts", "utf8");
    expect(orderActions).not.toContain("error instanceof Error ? error.message");
    expect(printActions).not.toContain("error instanceof Error ? error.message");
  });

  it("keeps WhatsApp connection identifiers managed server-side instead of editable by restaurants", () => {
    const page = readFileSync("src/app/(app)/configuracoes/conversas/page.tsx", "utf8");
    const action = readFileSync("src/features/conversations/settings-actions.ts", "utf8");
    expect(page).not.toContain('name="phoneNumberId"');
    expect(page).not.toContain('name="businessAccountId"');
    expect(page).not.toContain('name="accessTokenSecretRef"');
    expect(page).not.toContain('name="appSecretSecretRef"');
    expect(action).toContain("ConversationSettingsService.load()");
    expect(action).toContain("current?.whatsapp_phone_number_id");
  });
});
