import Link from "next/link";
import { SupplierService } from "@/server/purchases/supplier-service";
import { SupplierCatalogForm, SupplierConfigForm, SupplierCreateForm } from "@/features/purchases/purchase-forms";

function money(cents: number | string) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100); }

export default async function SuppliersPage() {
  const data = await SupplierService.load();
  return <section style={{ display: "grid", gap: 18, maxWidth: 1280 }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
      <div><p className="muted" style={{ margin: 0 }}>Compras por unidade</p><h1 style={{ margin: "3px 0" }}>Fornecedores</h1><p className="muted" style={{ margin: 0, maxWidth: 760 }}>O fornecedor pertence à organização; prazo, pedido mínimo e catálogo podem variar por unidade. Conversão de embalagem para g/ml/unidade é registrada de forma exata.</p></div>
      <div style={{ display: "flex", gap: 14 }}><Link href="/estoque" style={{ color: "var(--accent)", fontWeight: 800 }}>Estoque</Link><Link href="/compras" style={{ color: "var(--accent)", fontWeight: 850 }}>Pedidos de compra →</Link></div>
    </header>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(300px,.65fr)", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 12 }}>
        {data.suppliers.length === 0 ? <article className="card" style={{ padding: 18 }}><p className="muted" style={{ margin: 0 }}>Nenhum fornecedor cadastrado.</p></article> : data.suppliers.map((supplier) => {
          const config = supplier.config;
          return <article key={supplier.id} className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong style={{ fontSize: 18 }}>{supplier.name}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{supplier.tax_document || supplier.legal_name || "Sem documento informado"}</div></div><div style={{ textAlign: "right" }}><strong style={{ color: config?.active ? "#22c55e" : "#f59e0b" }}>{config?.active ? "Ativo na unidade" : "Não habilitado"}</strong>{config ? <div className="muted" style={{ fontSize: 11 }}>{config.lead_time_days} dia(s) · mínimo {money(config.minimum_order_cents)}</div> : null}</div></div>
            {supplier.email || supplier.phone ? <div className="muted" style={{ fontSize: 12 }}>{[supplier.email,supplier.phone].filter(Boolean).join(" · ")}</div> : null}
            {supplier.catalog.length ? <div style={{ display: "grid", gap: 5 }}><strong style={{ fontSize: 12 }}>Catálogo nesta unidade</strong>{supplier.catalog.map((row) => {
              const item = data.inventory.find((candidate) => candidate.id === row.inventory_item_id);
              return <div key={row.inventory_item_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, borderTop: "1px solid var(--border)", paddingTop: 6 }}><span>{item?.name ?? "Insumo"}{row.is_preferred ? " · preferencial" : ""}</span><span className="muted">{row.purchase_unit_label} = {String(row.base_units_per_purchase_unit)} {item?.base_unit ?? ""} · {money(row.last_unit_cost_cents)}</span></div>;
            })}</div> : null}
            {data.canManage ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10 }}><details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Condições da unidade</summary><div style={{ marginTop: 8 }}><SupplierConfigForm supplierId={supplier.id} active={config?.active ?? false} leadTimeDays={config?.lead_time_days ?? 0} minimumOrderCents={config?.minimum_order_cents ?? 0} notes={config?.notes ?? null} /></div></details>{config?.active ? <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Adicionar/atualizar insumo</summary><div style={{ marginTop: 8 }}><SupplierCatalogForm supplierId={supplier.id} inventory={data.inventory} /></div></details> : null}</div> : null}
          </article>;
        })}
      </div>
      {data.canManage ? <aside><article className="card" style={{ padding: 16, display: "grid", gap: 10 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Novo fornecedor</h2><p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>O cadastro mestre pode ser reutilizado em outras unidades da mesma organização.</p></div><SupplierCreateForm /></article></aside> : null}
    </div>
  </section>;
}
