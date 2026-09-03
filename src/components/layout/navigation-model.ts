import { isModuleKey, type ModuleKey } from "@/modules/module-catalog";
import { canNavigateToModule, type ModuleRbacDecision } from "@/modules/module-rbac";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";

export type OperationalContext =
  | "management"
  | "manager"
  | "cashier"
  | "service"
  | "floor"
  | "kitchen"
  | "delivery"
  | "administrative";

export type NavigationPriority = "primary" | "secondary" | "hidden";
export type NavigationGroup = "operation" | "management" | "supplies" | "relationship" | "administration";

export type NavigationModule = {
  key: string;
  label: string;
  href: string;
  group: NavigationGroup;
  permissions: readonly PermissionKey[];
  authorization: "organization" | "platform";
};

export const SYSTEM_ROLE_CONTEXTS: Record<string, readonly OperationalContext[]> = {
  owner: ["management"],
  manager: ["manager"],
  cashier: ["cashier"],
  attendant: ["service"],
  waiter: ["floor"],
  kitchen: ["kitchen"],
  driver: ["delivery"],
  financial: ["administrative"],
};

export const NAVIGATION_MODULES = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", group: "management", permissions: [PERMISSIONS.DASHBOARD_VIEW], authorization: "organization" },
  { key: "orders", label: "Pedidos", href: "/pedidos", group: "operation", permissions: [PERMISSIONS.ORDERS_VIEW], authorization: "organization" },
  { key: "conversations", label: "Conversas", href: "/conversas", group: "relationship", permissions: [PERMISSIONS.CONVERSATIONS_VIEW], authorization: "organization" },
  { key: "dining", label: "Salão", href: "/salao", group: "operation", permissions: [PERMISSIONS.DINING_VIEW, PERMISSIONS.ORDERS_VIEW], authorization: "organization" },
  { key: "catalog", label: "Cardápio", href: "/cardapio/produtos", group: "administration", permissions: [PERMISSIONS.PRODUCTS_VIEW], authorization: "organization" },
  { key: "pdv", label: "PDV", href: "/pdv", group: "operation", permissions: [PERMISSIONS.ORDERS_CREATE], authorization: "organization" },
  { key: "cash", label: "Caixa", href: "/caixa", group: "operation", permissions: [PERMISSIONS.CASH_VIEW, PERMISSIONS.CASH_OPEN], authorization: "organization" },
  { key: "finance", label: "Financeiro", href: "/financeiro", group: "management", permissions: [PERMISSIONS.FINANCE_VIEW, PERMISSIONS.REPORTS_VIEW], authorization: "organization" },
  { key: "fiscal", label: "Fiscal", href: "/fiscal", group: "administration", permissions: [PERMISSIONS.FISCAL_VIEW], authorization: "organization" },
  { key: "production", label: "Produção", href: "/producao", group: "operation", permissions: [PERMISSIONS.ORDERS_VIEW], authorization: "organization" },
  { key: "deliveries", label: "Entregas", href: "/entregas", group: "operation", permissions: [PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.ORDERS_VIEW], authorization: "organization" },
  { key: "driver", label: "Meu roteiro", href: "/entregador", group: "operation", permissions: [PERMISSIONS.DELIVERY_VIEW, PERMISSIONS.ORDERS_VIEW], authorization: "organization" },
  { key: "inventory", label: "Estoque", href: "/estoque", group: "supplies", permissions: [PERMISSIONS.INVENTORY_VIEW], authorization: "organization" },
  { key: "gas_containers", label: "Vasilhames", href: "/vasilhames", group: "supplies", permissions: [PERMISSIONS.GAS_CONTAINERS_VIEW], authorization: "organization" },
  { key: "suppliers", label: "Fornecedores", href: "/fornecedores", group: "supplies", permissions: [PERMISSIONS.SUPPLIERS_VIEW], authorization: "organization" },
  { key: "purchases", label: "Compras", href: "/compras", group: "supplies", permissions: [PERMISSIONS.PURCHASES_VIEW], authorization: "organization" },
  { key: "customers", label: "Clientes", href: "/clientes", group: "relationship", permissions: [PERMISSIONS.CUSTOMERS_VIEW], authorization: "organization" },
  { key: "growth", label: "Crescimento", href: "/crescimento", group: "relationship", permissions: [PERMISSIONS.GROWTH_VIEW], authorization: "organization" },
  { key: "scale", label: "Escala", href: "/escala", group: "administration", permissions: [PERMISSIONS.SCALE_VIEW], authorization: "organization" },
  { key: "team", label: "Equipe", href: "/equipe", group: "administration", permissions: [PERMISSIONS.TEAM_VIEW], authorization: "organization" },
  { key: "subscription", label: "Minha assinatura", href: "/assinatura", group: "administration", permissions: [PERMISSIONS.SUBSCRIPTION_VIEW], authorization: "organization" },
  { key: "settings", label: "Configurações", href: "/configuracoes", group: "administration", permissions: [PERMISSIONS.ORGANIZATION_MANAGE, PERMISSIONS.STORES_VIEW, PERMISSIONS.PRINTING_VIEW, PERMISSIONS.INTEGRATIONS_VIEW, PERMISSIONS.BRANDING_VIEW, PERMISSIONS.SUBSCRIPTION_VIEW], authorization: "organization" },
  { key: "platform", label: "Plataforma", href: "/platform", group: "administration", permissions: [], authorization: "platform" },
] as const satisfies readonly NavigationModule[];

const P = "primary" as const;
const S = "secondary" as const;
const H = "hidden" as const;

export const CONTEXT_MODULE_PRIORITY: Record<OperationalContext, Record<string, NavigationPriority>> = {
  management: { dashboard:P, orders:P, cash:P, finance:P, inventory:S, gas_containers:S, catalog:S, customers:S, growth:S, fiscal:S, purchases:S, team:S, conversations:S, dining:S, pdv:S, production:S, deliveries:S, driver:H, suppliers:S, scale:S, subscription:S, settings:S, platform:H },
  manager: { orders:P, dining:P, production:P, deliveries:P, dashboard:S, cash:S, pdv:S, conversations:S, inventory:S, gas_containers:S, team:S, customers:S, catalog:S, finance:S, fiscal:H, purchases:S, suppliers:H, growth:H, driver:H, scale:S, subscription:S, settings:S, platform:H },
  cashier: { pdv:P, cash:P, orders:P, customers:S, conversations:S, dining:S, dashboard:S, catalog:H, finance:H, fiscal:H, production:H, deliveries:H, driver:H, inventory:H, gas_containers:H, suppliers:H, purchases:H, growth:H, scale:H, team:H, subscription:H, settings:H, platform:H },
  service: { conversations:P, orders:P, customers:P, pdv:S, deliveries:S, catalog:S, dashboard:S, dining:S, cash:H, finance:H, fiscal:H, production:H, driver:H, inventory:H, gas_containers:H, suppliers:H, purchases:H, growth:H, scale:H, team:H, subscription:H, settings:H, platform:H },
  floor: { dining:P, orders:P, customers:S, catalog:S, pdv:S, dashboard:H, conversations:H, cash:H, finance:H, fiscal:H, production:H, deliveries:H, driver:H, inventory:H, gas_containers:H, suppliers:H, purchases:H, growth:H, scale:H, team:H, subscription:H, settings:H, platform:H },
  kitchen: { production:P, orders:S, dashboard:H, conversations:H, dining:H, catalog:H, pdv:H, cash:H, finance:H, fiscal:H, deliveries:H, driver:H, inventory:H, gas_containers:H, suppliers:H, purchases:H, customers:H, growth:H, scale:H, team:H, subscription:H, settings:H, platform:H },
  delivery: { driver:P, deliveries:H, orders:H, dashboard:H, conversations:H, dining:H, catalog:H, pdv:H, cash:H, finance:H, fiscal:H, production:H, inventory:H, gas_containers:H, suppliers:H, purchases:H, customers:H, growth:H, scale:H, team:H, subscription:H, settings:H, platform:H },
  administrative: { catalog:P, inventory:P, gas_containers:P, purchases:P, suppliers:P, fiscal:P, settings:P, finance:S, team:S, scale:S, customers:S, dashboard:S, growth:S, subscription:P, orders:H, conversations:H, dining:H, pdv:H, cash:H, production:H, deliveries:H, driver:H, platform:H },
};

const priorityWeight: Record<NavigationPriority, number> = { hidden: 0, secondary: 1, primary: 2 };

export function contextsForRoleKeys(roleKeys: readonly string[]): OperationalContext[] {
  const contexts = roleKeys.flatMap((roleKey) => SYSTEM_ROLE_CONTEXTS[roleKey] ?? []);
  return [...new Set(contexts)];
}

export function priorityForModule(contexts: readonly OperationalContext[], moduleKey: string): NavigationPriority {
  if (contexts.length === 0) return "secondary";
  return contexts.reduce<NavigationPriority>((best, context) => {
    const next = CONTEXT_MODULE_PRIORITY[context][moduleKey] ?? "hidden";
    return priorityWeight[next] > priorityWeight[best] ? next : best;
  }, "hidden");
}

export function canSurfaceModule(module: NavigationModule, grantedPermissions: ReadonlySet<string>, platformAuthorized = false) {
  if (module.authorization === "platform") return platformAuthorized;
  return module.permissions.length === 0 || module.permissions.some((permission) => grantedPermissions.has(permission));
}

export function contextualNavigation(contexts: readonly OperationalContext[], grantedPermissions: ReadonlySet<string>, platformAuthorized = false) {
  return NAVIGATION_MODULES
    .map((module) => ({ ...module, priority: priorityForModule(contexts, module.key) }))
    .filter((module) => module.priority !== "hidden" && canSurfaceModule(module, grantedPermissions, platformAuthorized));
}

/**
 * Rollout-safe navigation gate. Existing navigation remains untouched until callers explicitly provide
 * module RBAC decisions from the new resolver; once provided, the same decision used by server guards
 * controls whether a module can surface in navigation.
 */
export function contextualNavigationWithModuleRbac(
  contexts: readonly OperationalContext[],
  grantedPermissions: ReadonlySet<string>,
  moduleDecisions: Readonly<Partial<Record<ModuleKey, ModuleRbacDecision>>>,
  platformAuthorized = false,
) {
  return contextualNavigation(contexts, grantedPermissions, platformAuthorized).filter((module) => {
    if (!isModuleKey(module.key)) return true;
    const decision = moduleDecisions[module.key];
    return decision ? canNavigateToModule(decision) : true;
  });
}
