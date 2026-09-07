import type { CatalogAdapter, LogisticsAdapter, SalesChannelAdapter } from "@/server/integrations/core/contracts";
import { IntegrationConfigurationError } from "@/server/integrations/core/errors";

export type IntegrationAdapterKind = "sales" | "catalog" | "logistics";
export type IntegrationAdapterScope = {
  organizationId: string;
  storeId: string;
  integrationAccountId: string;
};

type AdapterByKind = {
  sales: SalesChannelAdapter;
  catalog: CatalogAdapter;
  logistics: LogisticsAdapter;
};

function registryKey(kind: IntegrationAdapterKind, scope: IntegrationAdapterScope) {
  return [kind, scope.organizationId, scope.storeId, scope.integrationAccountId].join(":");
}

/**
 * Runtime registry is explicitly tenant/store/account scoped. Registering an
 * adapter for Store A can never make it resolvable for Store B by provider name.
 */
export class IntegrationProviderRegistry {
  private readonly adapters = new Map<string, AdapterByKind[IntegrationAdapterKind]>();

  register<K extends IntegrationAdapterKind>(kind: K, scope: IntegrationAdapterScope, adapter: AdapterByKind[K]) {
    const key = registryKey(kind, scope);
    if (this.adapters.has(key)) {
      throw new IntegrationConfigurationError(`Adapter already registered for ${key}`, "adapter_already_registered");
    }
    this.adapters.set(key, adapter);
  }

  has(kind: IntegrationAdapterKind, scope: IntegrationAdapterScope) {
    return this.adapters.has(registryKey(kind, scope));
  }

  resolve<K extends IntegrationAdapterKind>(kind: K, scope: IntegrationAdapterScope): AdapterByKind[K] {
    const key = registryKey(kind, scope);
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new IntegrationConfigurationError(`No ${kind} adapter configured for this integration account`, "adapter_not_configured");
    }
    return adapter as AdapterByKind[K];
  }

  remove(kind: IntegrationAdapterKind, scope: IntegrationAdapterScope) {
    this.adapters.delete(registryKey(kind, scope));
  }
}
