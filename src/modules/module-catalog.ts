import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";

export const MODULE_CATALOG_VERSION = 1;

export const BUSINESS_TYPES = ["restaurant", "gas", "generic_commerce"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const MODULE_PRESETS = ["essential", "complete", "custom"] as const;
export type ModulePreset = (typeof MODULE_PRESETS)[number];

export const MODULE_KEYS = [
  "dashboard",
  "orders",
  "conversations",
  "dining",
  "catalog",
  "pdv",
  "cash",
  "finance",
  "fiscal",
  "production",
  "deliveries",
  "driver",
  "inventory",
  "suppliers",
  "purchases",
  "customers",
  "growth",
  "scale",
  "team",
  "settings",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleKind = "core" | "optional" | "segmented";
export type ModuleGroup = "operation" | "management" | "supplies" | "relationship" | "administration";

export type ModuleDefinition = {
  key: ModuleKey;
  defaultLabel: string;
  description: string;
  group: ModuleGroup;
  routes: readonly string[];
  permissionsAny: readonly PermissionKey[];
  dependencies: readonly ModuleKey[];
  incompatibleWith: readonly ModuleKey[];
  kind: ModuleKind;
  canDisable: boolean;
  supportedBusinessTypes: readonly BusinessType[];
  labels?: Partial<Record<BusinessType, string>>;
  /** Optional bridge to the existing EntitlementService. Null means no plan gate is mapped yet. */
  entitlementFeatureKey: string | null;
};

const ALL_BUSINESS_TYPES: readonly BusinessType[] = BUSINESS_TYPES;
const COMMERCE_BUSINESS_TYPES: readonly BusinessType[] = ["restaurant", "gas", "generic_commerce"];

export const MODULE_CATALOG: Record<ModuleKey, ModuleDefinition> = {
  dashboard: {
    key: "dashboard", defaultLabel: "Dashboard", description: "Resumo operacional da unidade.", group: "management",
    routes: ["/dashboard"], permissionsAny: [PERMISSIONS.DASHBOARD_VIEW], dependencies: [], incompatibleWith: [],
    kind: "core", canDisable: false, supportedBusinessTypes: ALL_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  orders: {
    key: "orders", defaultLabel: "Pedidos", description: "Núcleo de pedidos e acompanhamento operacional.", group: "operation",
    routes: ["/pedidos"], permissionsAny: [PERMISSIONS.ORDERS_VIEW], dependencies: [], incompatibleWith: [],
    kind: "core", canDisable: false, supportedBusinessTypes: ALL_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  conversations: {
    key: "conversations", defaultLabel: "Conversas", description: "Atendimento e conversas com clientes.", group: "relationship",
    routes: ["/conversas", "/configuracoes/conversas"], permissionsAny: [PERMISSIONS.CONVERSATIONS_VIEW], dependencies: [], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  dining: {
    key: "dining", defaultLabel: "Salão", description: "Mesas, comandas e atendimento no salão.", group: "operation",
    routes: ["/salao", "/configuracoes/salao"], permissionsAny: [PERMISSIONS.DINING_VIEW, PERMISSIONS.ORDERS_VIEW], dependencies: ["orders", "catalog"], incompatibleWith: [],
    kind: "segmented", canDisable: true, supportedBusinessTypes: ["restaurant"], entitlementFeatureKey: null,
  },
  catalog: {
    key: "catalog", defaultLabel: "Cardápio", description: "Produtos, categorias e opções de venda.", group: "administration",
    routes: ["/cardapio", "/configuracoes/cardapio"], permissionsAny: [PERMISSIONS.PRODUCTS_VIEW], dependencies: [], incompatibleWith: [],
    kind: "core", canDisable: false, supportedBusinessTypes: ALL_BUSINESS_TYPES,
    labels: { gas: "Catálogo", generic_commerce: "Catálogo" }, entitlementFeatureKey: null,
  },
  pdv: {
    key: "pdv", defaultLabel: "PDV", description: "Venda direta no balcão/caixa.", group: "operation",
    routes: ["/pdv"], permissionsAny: [PERMISSIONS.ORDERS_CREATE], dependencies: ["orders", "catalog"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  cash: {
    key: "cash", defaultLabel: "Caixa", description: "Abertura, movimentação e fechamento de caixa.", group: "operation",
    routes: ["/caixa", "/configuracoes/caixa"], permissionsAny: [PERMISSIONS.CASH_VIEW, PERMISSIONS.CASH_OPEN], dependencies: ["orders"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  finance: {
    key: "finance", defaultLabel: "Financeiro", description: "Contas, relatórios e visão financeira.", group: "management",
    routes: ["/financeiro"], permissionsAny: [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW], dependencies: [], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  fiscal: {
    key: "fiscal", defaultLabel: "Fiscal", description: "Operações e integrações fiscais.", group: "administration",
    routes: ["/fiscal"], permissionsAny: [PERMISSIONS.FISCAL_VIEW], dependencies: ["orders"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  production: {
    key: "production", defaultLabel: "Produção", description: "Fila de preparação/fulfillment dos pedidos.", group: "operation",
    routes: ["/producao"], permissionsAny: [PERMISSIONS.ORDERS_VIEW], dependencies: ["orders"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES,
    labels: { gas: "Separação", generic_commerce: "Operação" }, entitlementFeatureKey: null,
  },
  deliveries: {
    key: "deliveries", defaultLabel: "Entregas", description: "Gestão de entregas dos pedidos.", group: "operation",
    routes: ["/entregas", "/configuracoes/entrega"], permissionsAny: [PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.ORDERS_VIEW], dependencies: ["orders"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  driver: {
    key: "driver", defaultLabel: "Meu roteiro", description: "Execução das entregas pelo entregador.", group: "operation",
    routes: ["/entregador", "/configuracoes/entregadores"], permissionsAny: [PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.ORDERS_VIEW], dependencies: ["deliveries"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  inventory: {
    key: "inventory", defaultLabel: "Estoque", description: "Saldos, movimentos e controles de estoque.", group: "supplies",
    routes: ["/estoque"], permissionsAny: [PERMISSIONS.INVENTORY_VIEW], dependencies: [], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  suppliers: {
    key: "suppliers", defaultLabel: "Fornecedores", description: "Cadastro e gestão de fornecedores.", group: "supplies",
    routes: ["/fornecedores"], permissionsAny: [PERMISSIONS.SUPPLIERS_VIEW], dependencies: [], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  purchases: {
    key: "purchases", defaultLabel: "Compras", description: "Pedidos de compra e recebimento de mercadorias.", group: "supplies",
    routes: ["/compras"], permissionsAny: [PERMISSIONS.PURCHASES_VIEW], dependencies: ["inventory", "suppliers"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  customers: {
    key: "customers", defaultLabel: "Clientes", description: "Cadastro, endereços e histórico de clientes.", group: "relationship",
    routes: ["/clientes"], permissionsAny: [PERMISSIONS.CUSTOMERS_VIEW], dependencies: [], incompatibleWith: [],
    kind: "core", canDisable: false, supportedBusinessTypes: ALL_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  growth: {
    key: "growth", defaultLabel: "Crescimento", description: "Fidelidade, campanhas e relacionamento comercial.", group: "relationship",
    routes: ["/crescimento"], permissionsAny: [PERMISSIONS.GROWTH_VIEW], dependencies: ["customers", "orders"], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  scale: {
    key: "scale", defaultLabel: "Escala", description: "Organização de escalas da equipe.", group: "administration",
    routes: ["/escala"], permissionsAny: [PERMISSIONS.SCALE_VIEW], dependencies: [], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  team: {
    key: "team", defaultLabel: "Equipe", description: "Usuários, papéis e acesso da equipe.", group: "administration",
    routes: ["/equipe"], permissionsAny: [PERMISSIONS.TEAM_VIEW], dependencies: [], incompatibleWith: [],
    kind: "optional", canDisable: true, supportedBusinessTypes: COMMERCE_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
  settings: {
    key: "settings", defaultLabel: "Configurações", description: "Configuração essencial da unidade e da organização.", group: "administration",
    routes: ["/configuracoes"], permissionsAny: [PERMISSIONS.ORGANIZATION_MANAGE, PERMISSIONS.STORES_VIEW, PERMISSIONS.PRINTING_VIEW, PERMISSIONS.INTEGRATIONS_VIEW, PERMISSIONS.BRANDING_VIEW, PERMISSIONS.SUBSCRIPTION_VIEW], dependencies: [], incompatibleWith: [],
    kind: "core", canDisable: false, supportedBusinessTypes: ALL_BUSINESS_TYPES, entitlementFeatureKey: null,
  },
};

export const CORE_MODULE_KEYS = MODULE_KEYS.filter((key) => MODULE_CATALOG[key].kind === "core");

const PROFILE_PRESETS: Record<BusinessType, Record<Exclude<ModulePreset, "custom">, readonly ModuleKey[]>> = {
  restaurant: {
    essential: ["pdv", "cash", "production", "deliveries"],
    complete: MODULE_KEYS.filter((key) => MODULE_CATALOG[key].supportedBusinessTypes.includes("restaurant")),
  },
  gas: {
    essential: ["pdv", "deliveries", "driver"],
    complete: MODULE_KEYS.filter((key) => MODULE_CATALOG[key].supportedBusinessTypes.includes("gas")),
  },
  generic_commerce: {
    essential: ["pdv"],
    complete: MODULE_KEYS.filter((key) => MODULE_CATALOG[key].supportedBusinessTypes.includes("generic_commerce")),
  },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

export function isBusinessType(value: string): value is BusinessType {
  return (BUSINESS_TYPES as readonly string[]).includes(value);
}

export function isModulePreset(value: string): value is ModulePreset {
  return (MODULE_PRESETS as readonly string[]).includes(value);
}

export function profileSupportsModule(businessType: BusinessType, moduleKey: ModuleKey) {
  return MODULE_CATALOG[moduleKey].supportedBusinessTypes.includes(businessType);
}

export function moduleLabel(moduleKey: ModuleKey, businessType: BusinessType) {
  return MODULE_CATALOG[moduleKey].labels?.[businessType] ?? MODULE_CATALOG[moduleKey].defaultLabel;
}

export function modulesForPreset(
  businessType: BusinessType,
  preset: ModulePreset,
  customModules: readonly ModuleKey[] = [],
): ModuleKey[] {
  const requested = preset === "custom" ? customModules : PROFILE_PRESETS[businessType][preset];
  const selected = new Set<ModuleKey>();

  for (const key of CORE_MODULE_KEYS) if (profileSupportsModule(businessType, key)) selected.add(key);
  for (const key of requested) if (profileSupportsModule(businessType, key)) selected.add(key);

  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...selected]) {
      for (const dependency of MODULE_CATALOG[key].dependencies) {
        if (!selected.has(dependency) && profileSupportsModule(businessType, dependency)) {
          selected.add(dependency);
          changed = true;
        }
      }
    }
  }

  return MODULE_KEYS.filter((key) => selected.has(key));
}

export function validateModuleCatalog(): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();

  for (const key of MODULE_KEYS) {
    const definition = MODULE_CATALOG[key];
    if (keys.has(key)) errors.push(`duplicate module key: ${key}`);
    keys.add(key);
    if (definition.key !== key) errors.push(`module key mismatch: ${key}`);
    if (definition.kind === "core" && definition.canDisable) errors.push(`core module cannot be disableable: ${key}`);
    for (const dependency of definition.dependencies) if (!MODULE_KEYS.includes(dependency)) errors.push(`unknown dependency ${dependency} from ${key}`);
    for (const incompatible of definition.incompatibleWith) if (!MODULE_KEYS.includes(incompatible)) errors.push(`unknown incompatible module ${incompatible} from ${key}`);
  }

  const visiting = new Set<ModuleKey>();
  const visited = new Set<ModuleKey>();
  const visit = (key: ModuleKey) => {
    if (visiting.has(key)) { errors.push(`dependency cycle at ${key}`); return; }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of MODULE_CATALOG[key].dependencies) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of MODULE_KEYS) visit(key);

  for (const businessType of BUSINESS_TYPES) {
    for (const preset of ["essential", "complete"] as const) {
      for (const key of PROFILE_PRESETS[businessType][preset]) {
        if (!profileSupportsModule(businessType, key)) errors.push(`${businessType}/${preset} includes unsupported ${key}`);
      }
    }
  }

  return errors;
}
