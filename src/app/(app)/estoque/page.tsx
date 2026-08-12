import Link from "next/link";
import { InventoryService } from "@/server/inventory/inventory-service";
import { formatQuantity, type InventoryBaseUnit } from "@/server/inventory/values";
import {
  EnableInventoryItemForm, InventoryItemCreateForm, InventoryMovementForm, InventoryReconcileForm,
  InventorySettingsForm, InventoryTransferForm,
} from "@/features/inventory/inventory-forms";

const movementLabels: Record<string, string> = { purchase: "Entrada", sale: "Venda", loss: "Perda", adjustment: "Ajuste", transfer: "Transferência", production: "Produção", return: "Retorno" };
function costInput(micros: number | string, unit: InventoryBaseUnit) {
  const value = Number(micros);
  const reais = unit === "unit" ? value / 100_000_000 : value / 100_000;
  return reais.toFixed(2).replace(".", ",");
}

export default async function InventoryPage() {
  const data = await InventoryService.load();
  const configured = data.items.filter((item) => item.config);
  const itemMap = new Map(data.items.map((item) => [item.id, item]));
  const low = configured.filter((item) => Number(item.balance?.quantity ?? 0) <= Number(item.config?.minimum_quantity ?? 0));
  const negative = configured.filter((item) => Number(item.balance?.quantity ?? 0) < 0);

  return (
    <section style={{ display: "grid", gap: 18, maxWidth: 1280 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
        <div><p className="muted" style={{ margin: 0 }}>Gestão por unidade</p><h1 style={{ margin: "3px 0" }}>Estoque</h1><p className="muted" style={{ margin: 0, maxWidth: 760 }}>O saldo é uma projeção do ledger imutável. Entradas, perdas, vendas, transferências e contagens geram movimentos; a tela nunca sobrescreve o saldo.</p></div>
        <Link href="/estoque/fichas" style={{ color: "var(--accent)", fontWeight: 850 }}>Fichas técnicas →</Link>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <Metric label="Insumos na unidade" value={configured.length} />
        <Metric label="Abaixo do mínimo" value={low.length} warning={low.length > 0} />
        <Metric label="Saldo negativo" value={negative.length} warning={negative.length > 0} />
        <Metric label="Movimentos recentes" value={data.movements.length} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(300px,.65fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0, fontSize: 18 }}>Insumos</h2><span className="muted" style={{ fontSize: 12 }}>{configured.length} configurado(s)</span></div>
          {configured.length === 0 ? <article className="card" style={{ padding: 18 }}><p className="muted" style={{ margin: 0 }}>Nenhum insumo configurado nesta unidade.</p></article> : configured.map((item) => {
            const config = item.config!;
            const unit = item.base_unit as InventoryBaseUnit;
            const quantity = String(item.balance?.quantity ?? "0");
            const isLow = Number(quantity) <= Number(config.minimum_quantity);
            return (
              <article key={item.id} className="card" style={{ padding: 16, display: "grid", gap: 12, border: isLow ? "1px solid #f59e0b" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div><strong style={{ fontSize: 18 }}>{item.name}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{item.sku ? `${item.sku} · ` : ""}{unit === "unit" ? "unidade" : unit === "g" ? "grama" : "mililitro"}{config.active ? "" : " · inativo nesta unidade"}</div></div>
                  <div style={{ textAlign: "right" }}><strong style={{ fontSize: 22, color: isLow ? "#f59e0b" : "var(--accent)" }}>{formatQuantity(quantity, unit)}</strong><div className="muted" style={{ fontSize: 11 }}>mínimo {formatQuantity(String(config.minimum_quantity), unit)}</div></div>
                </div>
                {isLow ? <div style={{ background: "rgba(245,158,11,.08)", padding: "8px 10px", borderRadius: 10, fontSize: 12 }}><strong>Reposição necessária.</strong> O saldo atingiu ou ficou abaixo do estoque mínimo.</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, alignItems: "start" }}>
                  {data.canAdjust && config.active ? <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Movimentar</summary><div style={{ marginTop: 8 }}><InventoryMovementForm itemId={item.id} baseUnit={unit} /></div></details> : null}
                  {data.canAdjust && config.active ? <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Contagem física</summary><div style={{ marginTop: 8 }}><InventoryReconcileForm itemId={item.id} /></div></details> : null}
                  {data.canAdjust && config.active ? <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Transferir</summary><div style={{ marginTop: 8 }}><InventoryTransferForm itemId={item.id} stores={data.stores} currentStoreId={data.storeId} /></div></details> : null}
                  {data.canManage ? <details><summary style={{ cursor: "pointer", fontWeight: 800 }}>Configurar</summary><div style={{ marginTop: 8 }}><InventorySettingsForm itemId={item.id} baseUnit={unit} active={config.active} minimumQuantity={String(config.minimum_quantity)} allowNegative={config.allow_negative} costInput={costInput(config.average_cost_micros_per_base_unit, unit)} /></div></details> : null}
                </div>
              </article>
            );
          })}

          <h2 style={{ margin: "8px 0 0", fontSize: 18 }}>Movimentos recentes</h2>
          <article className="card" style={{ padding: 16, display: "grid", gap: 0 }}>
            {data.movements.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhum movimento nesta unidade.</p> : data.movements.map((movement) => {
              const item = itemMap.get(movement.inventory_item_id);
              const unit = (item?.base_unit ?? "unit") as InventoryBaseUnit;
              const delta = Number(movement.quantity_delta);
              return <div key={movement.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}><div><strong>{item?.name ?? "Insumo"} · {movementLabels[movement.movement_type] ?? movement.movement_type}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{movement.reason || movement.source_type || "Movimento operacional"} · {new Date(movement.created_at).toLocaleString("pt-BR")}</div></div><strong style={{ color: delta < 0 ? "#f97066" : "#22c55e" }}>{delta > 0 ? "+" : ""}{formatQuantity(String(movement.quantity_delta), unit)}</strong></div>;
            })}
          </article>
        </div>

        <aside style={{ display: "grid", gap: 12 }}>
          {data.canManage ? <article className="card" style={{ padding: 16, display: "grid", gap: 10 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Novo insumo</h2><p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>Use g/ml como unidade-base; kg e litro são apenas formatos de entrada/exibição.</p></div><InventoryItemCreateForm /></article> : null}
          {data.canManage && data.items.some((item) => !item.config) ? <article className="card" style={{ padding: 16, display: "grid", gap: 12 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Insumos de outras unidades</h2><p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>A identidade do insumo é da organização. Habilite na unidade atual para usar em transferências e fichas.</p></div>{data.items.filter((item) => !item.config).map((item) => <div key={item.id} style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}><strong>{item.name}</strong><div style={{ marginTop: 7 }}><EnableInventoryItemForm itemId={item.id} /></div></div>)}</article> : null}
        </aside>
      </div>
    </section>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <div className="card" style={{ padding: 14 }}><span className="muted" style={{ fontSize: 10 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 3, fontSize: 24, color: warning ? "#f59e0b" : undefined }}>{value}</strong></div>; }
