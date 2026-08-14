import Link from "next/link";
import { SemanticStatus } from "@/components/ui/status";
import { SupplierService } from "@/server/purchases/supplier-service";
import { SupplierCatalogForm, SupplierConfigForm, SupplierCreateForm } from "@/features/purchases/purchase-forms";
import styles from "@/features/purchases/procurement.module.css";

function money(cents: number | string) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100); }

export default async function SuppliersPage() {
  const data = await SupplierService.load();
  return <section className={styles.page}>
    <header className={styles.header}><div className={styles.headerCopy}><p className="muted">Etapa 3 do fluxo de compras</p><h1>Fornecedores</h1><p className="muted">O cadastro é da organização; prazo, pedido mínimo e catálogo são configurados por unidade e alimentam o pedido de compra.</p></div><div className={styles.links}><Link href="/compras" className={styles.link}>← Compras</Link><Link href="/estoque" className={styles.link}>Estoque</Link></div></header>

    <div className={styles.columns}>
      <div className={styles.supplierList}>{data.suppliers.length===0 ? <article className={`card ${styles.card}`}><p className="muted">Nenhum fornecedor cadastrado.</p></article> : data.suppliers.map((supplier)=>{const config=supplier.config;return <article key={supplier.id} className={`card ${styles.supplier}`}>
        <div className={styles.top}><div className={styles.identity}><strong>{supplier.name}</strong><span className={styles.meta}>{supplier.tax_document||supplier.legal_name||"Sem documento informado"}</span>{supplier.email||supplier.phone ? <span className={styles.meta}>{[supplier.email,supplier.phone].filter(Boolean).join(" · ")}</span>:null}</div><div className={styles.side}>{config?.active ? <SemanticStatus tone="success" icon="✓" label="Ativo na unidade"/> : <SemanticStatus tone="warning" icon="!" label="Não habilitado"/>}{config ? <span className={styles.meta}>{config.lead_time_days} dia(s) · mínimo {money(config.minimum_order_cents)}</span>:null}</div></div>
        {supplier.catalog.length ? <div className={styles.catalog}><strong>Catálogo nesta unidade</strong>{supplier.catalog.map((row)=>{const item=data.inventory.find((candidate)=>candidate.id===row.inventory_item_id);return <div key={row.inventory_item_id} className={styles.catalogRow}><span>{item?.name??"Insumo"}{row.is_preferred?" · preferencial":""}</span><span className="muted">{row.purchase_unit_label} = {String(row.base_units_per_purchase_unit)} {item?.base_unit??""} · {money(row.last_unit_cost_cents)}</span></div>;})}</div>:<span className={styles.meta}>Nenhum insumo associado nesta unidade.</span>}
        {data.canManage ? <div className={styles.actions}><details><summary>Condições da unidade</summary><div className={styles.actionBody}><SupplierConfigForm supplierId={supplier.id} active={config?.active??false} leadTimeDays={config?.lead_time_days??0} minimumOrderCents={config?.minimum_order_cents??0} notes={config?.notes??null}/></div></details>{config?.active ? <details><summary>Adicionar ou atualizar insumo</summary><div className={styles.actionBody}><SupplierCatalogForm supplierId={supplier.id} inventory={data.inventory}/></div></details>:null}</div>:null}
      </article>;})}</div>
      {data.canManage ? <aside><article className={`card ${styles.card}`}><div><h2>Novo fornecedor</h2><p className="muted">Crie o cadastro mestre e depois configure as condições da unidade.</p></div><SupplierCreateForm/></article></aside>:null}
    </div>
  </section>;
}
