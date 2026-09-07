import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("iFood self-service integration UI contract", () => {
  it("keeps integration structurally separate from modules and capabilities", () => {
    const page = source("src/app/(app)/configuracoes/integracoes/page.tsx");
    const card = source("src/app/(app)/configuracoes/integracoes/ifood-connection-card.tsx");
    expect(page).toContain("Integração não é módulo");
    expect(page).toContain("permanecem desligados");
    expect(card).toContain("ifood_orders");
    expect(card).toContain("ifood_catalog");
    expect(card).toContain("ifood_shipping");
    expect(card).toContain("desligado");
  });

  it("blocks onboarding while omnichannel infrastructure is not promoted", () => {
    const service = source("src/server/integrations/providers/ifood/ifood-integration-settings-service.ts");
    const page = source("src/app/(app)/configuracoes/integracoes/page.tsx");
    expect(service).toContain("infrastructureReady: false");
    expect(service).toContain("PGRST205".toLowerCase());
    expect(page).toContain("aguardando promoção");
  });

  it("keeps provider secrets out of the client component", () => {
    const card = source("src/app/(app)/configuracoes/integracoes/ifood-connection-card.tsx");
    expect(card).not.toContain("clientSecret");
    expect(card).not.toContain("accessToken");
    expect(card).not.toContain("refreshToken");
    expect(card).not.toContain("authorizationCodeVerifier");
  });

  it("adds iFood health with a safe missing-schema fallback", () => {
    const service = source("src/server/platform/platform-ifood-health-service.ts");
    const platform = source("src/app/platform/integracoes/page.tsx");
    expect(service).toContain("integration_accounts");
    expect(service).toContain("return []");
    expect(platform).toContain("PlatformIfoodHealthService.load()");
  });
});
