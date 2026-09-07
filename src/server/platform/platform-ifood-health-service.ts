import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";
import type { IntegrationHealthState } from "@/server/platform/platform-integration-health-service";

export type PlatformIfoodHealthItem = {
  key: string;
  kind: "ifood";
  organizationId: string | null;
  organizationName: string;
  storeId: string | null;
  storeName: string;
  state: IntegrationHealthState;
  label: string;
  impact: string;
  detail: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

function infrastructureMissing(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) return false;
  const value = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return value.includes("42p01") || value.includes("pgrst205") || (value.includes("integration_accounts") && (value.includes("does not exist") || value.includes("schema cache")));
}

function stateOf(value: unknown): IntegrationHealthState {
  return value === "connected" || value === "attention" || value === "action_required" || value === "unavailable" || value === "disconnected"
    ? value
    : "disconnected";
}

export class PlatformIfoodHealthService {
  static async load(): Promise<PlatformIfoodHealthItem[]> {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const accounts = await admin
      .from("integration_accounts")
      .select("id,organization_id,status,environment,auth_mode,connection_state,last_health_at,last_health_error_code")
      .eq("provider", "ifood")
      .order("updated_at", { ascending: false });

    if (infrastructureMissing(accounts.error)) return [];
    if (accounts.error) throw accounts.error;
    if (!accounts.data?.length) return [];

    const [organizations, stores, merchants] = await Promise.all([
      admin.from("organizations").select("id,name"),
      admin.from("stores").select("id,organization_id,name"),
      admin.from("integration_merchants").select("id,organization_id,store_id,integration_account_id,environment,display_name,capabilities").eq("provider", "ifood"),
    ]);
    for (const result of [organizations, stores, merchants]) if (result.error) throw result.error;

    const orgNames = new Map((organizations.data ?? []).map((row) => [String(row.id), String(row.name)]));
    const storeNames = new Map((stores.data ?? []).map((row) => [String(row.id), String(row.name)]));
    const merchantRows = merchants.data ?? [];
    const items: PlatformIfoodHealthItem[] = [];

    for (const account of accounts.data) {
      const linked = merchantRows.filter((merchant) => merchant.integration_account_id === account.id);
      const rows = linked.length > 0 ? linked : [null];
      for (const merchant of rows) {
        const rawCaps = merchant?.capabilities && typeof merchant.capabilities === "object" && !Array.isArray(merchant.capabilities)
          ? merchant.capabilities as Record<string, unknown>
          : {};
        const activeCapabilities = Object.values(rawCaps).filter((value) => value === true).length;
        const state = stateOf(account.status);
        const environment = account.environment === "production" ? "produção" : "sandbox";
        const connectionState = typeof account.connection_state === "string" ? account.connection_state : "not_connected";
        const hasFailure = typeof account.last_health_error_code === "string" && account.last_health_error_code.length > 0;
        items.push({
          key: `ifood:${account.id}:${merchant?.store_id ?? "unbound"}`,
          kind: "ifood",
          organizationId: String(account.organization_id),
          organizationName: orgNames.get(String(account.organization_id)) ?? "Empresa",
          storeId: merchant?.store_id ? String(merchant.store_id) : null,
          storeName: merchant?.store_id ? storeNames.get(String(merchant.store_id)) ?? "Unidade" : "Sem unidade vinculada",
          state,
          label: `iFood · ${environment}`,
          impact: activeCapabilities > 0
            ? `${activeCapabilities} capability(s) habilitada(s); acompanhe a operação omnichannel.`
            : "Autenticação e vínculo não alteram módulos ou fluxo; capabilities continuam desligadas.",
          detail: merchant
            ? `${merchant.display_name ? String(merchant.display_name) : "Estabelecimento vinculado"}. Conexão: ${connectionState}${hasFailure ? ` · health ${String(account.last_health_error_code)}` : ""}.`
            : `Conta iFood ${connectionState}, ainda sem Merchant ↔ Store concluído.`,
          lastSuccessAt: state === "connected" && typeof account.last_health_at === "string" ? account.last_health_at : null,
          lastFailureAt: hasFailure && typeof account.last_health_at === "string" ? account.last_health_at : null,
        });
      }
    }

    return items;
  }
}
