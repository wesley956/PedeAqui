import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_MODULE_KEYS, MODULE_CATALOG, modulesForPreset } from "@/modules/module-catalog";
import { planModuleActivation } from "@/modules/module-lifecycle";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const domainSql = read("supabase/sql/107_gas_segment_domain.sql");
const integrationSql = read("supabase/sql/108_gas_segment_integrations.sql");
const repriceSql = read("supabase/sql/109_gas_cart_reprice.sql");
const securitySql = read("supabase/sql/110_gas_segment_security_hardening.sql");
const indexesSql = read("supabase/sql/111_gas_segment_fk_indexes.sql");

describe("gas segment [362]-[366]", () => {
  it("keeps gas as a profile over the shared PedeAqui core", () => {
    const gasEssential = modulesForPreset("gas", "essential");
    for (const core of CORE_MODULE_KEYS) expect(gasEssential).toContain(core);
    expect(gasEssential).toContain("deliveries");
    expect(gasEssential).not.toContain("dining");
    expect(MODULE_CATALOG.gas_containers.supportedBusinessTypes).toEqual(["gas"]);
    expect(MODULE_CATALOG.gas_containers.dependencies).toEqual(["orders", "catalog"]);
    expect(MODULE_CATALOG.gas_containers.entitlementFeatureKey).toBe("module.gas_containers");
  });

  it("keeps the vasilhame add-on explicit instead of silently enabling it in presets", () => {
    expect(modulesForPreset("gas", "complete")).not.toContain("gas_containers");
    const plan = planModuleActivation({ moduleKey: "gas_containers", businessType: "gas", enabledModuleKeys: new Set(CORE_MODULE_KEYS) });
    expect(plan.status).toBe("ready");
    expect(plan.changes.map((change) => change.moduleKey)).toEqual(["gas_containers"]);
    const blocked = planModuleActivation({ moduleKey: "gas_containers", businessType: "gas", enabledModuleKeys: new Set(CORE_MODULE_KEYS), modulesBlockedByPlan: new Set(["gas_containers"]) });
    expect(blocked.blockers.some((item) => item.code === "not_in_plan")).toBe(true);
  });

  it("models exchange and product-plus-container outside commercial stock", () => {
    for (const table of ["gas_container_types", "product_gas_profiles", "cart_item_gas_options", "order_item_gas_options", "gas_container_movements"]) expect(domainSql).toContain(`public.${table}`);
    expect(domainSql).toContain("sale_mode in ('exchange','with_container')");
    expect(domainSql).toContain("full_delta");
    expect(domainSql).toContain("empty_delta");
    expect(domainSql).toContain("in_route_delta");
    expect(domainSql).not.toContain("inventory_movements");
  });

  it("keeps cylinder movements tenant scoped, idempotent and compensates route cancellation", () => {
    expect(domainSql).toContain("constraint gas_container_movements_idempotency_unique unique(store_id,idempotency_key)");
    expect(domainSql).toContain("private.can_access_store(organization_id,store_id)");
    expect(domainSql).toContain("on conflict(store_id,idempotency_key) do nothing");
    expect(domainSql).toContain("v_kind:='route_return'");
    expect(domainSql).toContain("v_full:=r.quantity; v_route:=-r.quantity");
    expect(domainSql).toContain("old.fulfillment_status in ('picked_up','out_for_delivery')");
  });

  it("keeps gas pricing server-authoritative through add and reprice", () => {
    const cartService = read("src/server/cart/cart-service.ts");
    const actions = read("src/features/cart/actions.ts");
    expect(actions).toContain("gasSaleMode");
    expect(cartService).toContain('rpc("cart_add_gas_item_internal"');
    expect(domainSql).toContain("container_surcharge_cents");
    expect(domainSql).toContain("v_segment_total:=case when p_sale_mode='with_container'");
    expect(repriceSql).toContain("unit_segment_price_cents");
    expect(repriceSql).toContain("unit_container_price_cents");
  });

  it("preserves structured gas choice from public catalog to immutable order snapshot", () => {
    const productPage = read("src/app/m/[slug]/produto/[id]/page.tsx");
    const publicMenu = read("src/server/menu/public-menu-service.ts");
    expect(productPage).toContain('name="gasSaleMode" value="exchange"');
    expect(productPage).toContain('name="gasSaleMode" value="with_container"');
    expect(publicMenu).toContain("product_gas_profiles");
    expect(integrationSql).toContain("insert into public.order_item_gas_options");
    expect(integrationSql).toContain("unit_segment_price_cents");
  });

  it("covers the P13 delivery journey on the shared order and fulfillment engine", () => {
    const orderService = read("src/server/orders/public-order-service.ts");
    const tracking = read("src/app/m/[slug]/pedido/[id]/page.tsx");
    expect(domainSql).toContain("'dispatch'");
    expect(domainSql).toContain("'delivery_exchange'");
    expect(domainSql).toContain("'delivery_with_container'");
    expect(integrationSql).toContain("public.create_order_from_checkout_internal");
    expect(integrationSql).toContain("'digital_menu'");
    expect(orderService).toContain("order_item_gas_options");
    expect(tracking).toContain("item.gas");
    expect(tracking).toContain("Troca de vasilhame");
    expect(domainSql).not.toContain("gas_orders");
  });

  it("keeps dashboard and guide adaptive instead of cloning a gas interface", () => {
    const dashboard = read("src/app/(app)/dashboard/page.tsx");
    const guide = read("src/features/user-guide/guide-model.ts");
    const layout = read("src/app/(app)/layout.tsx");
    expect(dashboard).toContain("moduleVisible");
    expect(dashboard).toContain('experienceMode === "easy"');
    expect(guide).toContain("businessType");
    expect(layout).toContain("navigationAccess.businessType");
  });

  it("makes the owner 360 view module aware without exposing customer PII", () => {
    const service = read("src/server/platform/platform-restaurant-360-service.ts");
    const page = read("src/app/platform/empresas/[organizationId]/unidades/[storeId]/page.tsx");
    expect(service).toContain('from("store_modules")');
    expect(service).toContain('from("user_store_preferences")');
    expect(service).toContain("unavailableByPlan");
    expect(service).toContain("dependencyIssues");
    expect(page).toContain("Configuração modular");
    expect(page).toContain("Modo Fácil");
    for (const pii of ["customer_name_snapshot", "customer_phone_snapshot", "customer_email_snapshot", "address_street_snapshot"]) expect(service).not.toContain(pii);
  });

  it("routes support module changes through the official module service with preview, reason and audit", () => {
    const domain = read("src/server/modules/module-configuration-service.ts");
    const support = read("src/server/platform/platform-module-support-service.ts");
    const panel = read("src/app/platform/module-support-panel.tsx");
    expect(domain).toContain("static async supportPreview");
    expect(domain).toContain("static async supportApply");
    expect(support).toContain("ModuleConfigurationService.supportPreview");
    expect(support).toContain("ModuleConfigurationService.supportApply");
    expect(support).toContain('action: "platform.support.module_configuration"');
    expect(support).toContain("support_reason");
    expect(panel).toContain("Pré-validar e aplicar alteração");
    expect(panel).toContain('name="reason"');
    expect(panel).not.toContain("module.gas_containers");
  });

  it("hardens gas public access and covers new foreign keys", () => {
    expect(securitySql).toContain("security_invoker = true");
    expect(securitySql).toContain("cart_item_gas_options_deny_direct");
    for (const indexName of [
      "cart_item_gas_options_org_store_item_fk_idx",
      "order_item_gas_options_org_store_item_fk_idx",
      "gas_container_movements_org_store_type_fk_idx",
      "product_gas_profiles_org_store_type_fk_idx",
    ]) expect(indexesSql).toContain(indexName);
  });
});
