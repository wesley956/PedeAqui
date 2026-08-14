import Link from "next/link";
import { SemanticStatus } from "@/components/ui/status";
import { InventoryService } from "@/server/inventory/inventory-service";
import { formatQuantity, type InventoryBaseUnit } from "@/server/inventory/values";
import {
  EnableInventoryItemForm, InventoryItemCreateForm, InventoryMovementForm, InventoryReconcileForm,
  InventorySettingsForm, InventoryTransferForm,
} from "@/features/inventory/inventory-forms";
import styles from "./inventory-operations.module.css";

const movementLabels: Record<string, string> = { purchase: "Entrada", sale: "Venda", loss: "Perda", adjustment: "Ajuste", transfer: "Transferência", production: "Produção", return: "Retorno" };
function costInput(micros: number | string, unit: InventoryBaseUnit) { const value = Number(micros); const reais = unit === "unit" ? value / 100_000_000 : value / 100_000; return reais.toFixed(2).replace(".", ","); }
function unitLabel(unit: InventoryBaseUnit) { return unit === "unit" ? "unidade" : unit === "g" ? "grama" : "mililitro"; }

export default async function InventoryPage() {
  const data = await InventoryService.load();
  const configured = data.items.filter((item) => item.config);
  const itemMap = new Map(data.items.map((item) => [item.id, item]));
  const low = configured.filter((item) => Number(item.balance?.quantity ?? 0) <= Number(item.config?.minimum_quantity ?? 0));
  const negative = configured.filter((item) => Number(item.balance?.quantity ?? 0) < 0);

  return <section className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerCopy}><p className="muted">Gestão por unidade</p><h1>Estoque</h1><p className="muted">O saldo abaixo é uma projeção do ledger imutável. Toda correção acontece por movimento, contagem ou transferência — nunca por edição direta do saldo.</p></div>
      <Link href="/estoque/fichas" className={styles.link}>Fichas técnicas →</Link>
    </header>

    <div className={styles.metrics}>
      <Metric label="Insumos na unidade" value={configured.length} />
      <Metric label="Abaixo do mínimo" value={low.length} warning={low.length > 0} />
      <Metric label="Saldo negativo" value={negative.length} warning={negative.length > 0} />
      <Metric label="Movimentos recentes" value={data.movements.length} />
    </div>

    <div className={styles.columns}>
      <div className={styles.stack}>
        <div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>Saldo por insumo</h2><span className="muted">{configured.length} configurado(s)</span></div>
        {configured.length === 0 ? <article className={`card ${styles.itemCard}`}><p className="muted">Nenhum insumo configurado nesta unidade.</p></article> : configured.map((item) => {
          const config = item.config!; const unit = item.base_unit as InventoryBaseUnit; const quantity = String(item.balance?.quantity ?? "0"); const isLow = Number(quantity) <= Number(config.minimum_quantity); const isNegative = Number(quantity) < 0;
          return <article key={item.id} className={`card ${styles.itemCard}`}>
            <div className={styles.itemTop}>
              <div className={styles.itemIdentity}><span className={styles.itemName}>{item.name}</span><span className={styles.itemMeta}>{item.sku ? `${item.sku} · ` : ""}{unitLabel(unit)}{config.active ? "" : " · inativo nesta unidade"}</span>{isNegative ? <SemanticStatus tone="danger" icon="!" label="Saldo negativo" /> : isLow ? <SemanticStatus tone="warning" icon="!" label="Estoque baixo" /> : <SemanticStatus tone="success" icon="✓" label="Estoque normal" />}</div>
              <div className={styles.balance}><span className={`${styles.balanceValue} ${isLow ? styles.balanceWarning : ""}`}>{formatQuantity(quantity, unit)}</span><span className={styles.minimum}>mínimo {formatQuantity(String(config.minimum_quantity), unit)}</span></div>
            </div>
            {isLow ? <div className={styles.attention}><strong>Reposição necessária.</strong> O saldo atingiu ou ficou abaixo do mínimo configurado.</div> : null}
            <div className={styles.actions}>
              {data.canAdjust && config.active ? <details><summary>Movimentar</summary><div className={styles.actionBody}><InventoryMovementForm itemId={item.id} baseUnit={unit} /></div></details> : null}
              {data.canAdjust && config.active ? <details><summary>Contagem física</summary><div className={styles.actionBody}><InventoryReconcileForm itemId={item.id} /></div></details> : null}
              {data.canAdjust && config.active ? <details><summary>Transferir</summary><div className={styles.actionBody}><InventoryTransferForm itemId={item.id} stores={data.stores} currentStoreId={data.storeId} /></div></details> : null}
              {data.canManage ? <details><summary>Configuração do insumo</summary><div className={styles.actionBody}><InventorySettingsForm itemId={item.id} baseUnit={unit} active={config.active} minimumQuantity={String(config.minimum_quantity)} allowNegative={config.allow_negative} costInput={costInput(config.average_cost_micros_per_base_unit, unit)} /></div></details> : null}
            </div>
          </article>;
        })}

        <div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>Movimentos recentes</h2><span className="muted">Histórico operacional</span></div>
        <article className={`card ${styles.history}`}>
          {data.movements.length === 0 ? <p className="muted">Nenhum movimento nesta unidade.</p> : data.movements.map((movement) => { const item = itemMap.get(movement.inventory_item_id); const unit = (item?.base_unit ?? "unit") as InventoryBaseUnit; const delta = Number(movement.quantity_delta); return <div key={movement.id} className={styles.movement}><div className={styles.movementCopy}><strong>{item?.name ?? "Insumo"} · {movementLabels[movement.movement_type] ?? movement.movement_type}</strong><span className={styles.movementMeta}>{movement.reason || movement.source_type || "Movimento operacional"} · {new Date(movement.created_at).toLocaleString("pt-BR")}</span></div><strong className={delta < 0 ? styles.deltaNegative : styles.deltaPositive}>{delta > 0 ? "+" : ""}{formatQuantity(String(movement.quantity_delta), unit)}</strong></div>; })}
        </article>
      </div>

      <aside className={styles.aside}>
        {data.canManage ? <article className={`card ${styles.asideCard}`}><div><h2>Novo insumo</h2><p className="muted">Use g/ml como unidade-base; kg e litro são apenas formatos de entrada e exibição.</p></div><InventoryItemCreateForm /></article> : null}
        {data.canManage && data.items.some((item) => !item.config) ? <article className={`card ${styles.asideCard}`}><div><h2>Insumos de outras unidades</h2><p className="muted">Habilite na unidade atual para usar em transferências e fichas.</p></div>{data.items.filter((item) => !item.config).map((item) => <div key={item.id}><strong>{item.name}</strong><EnableInventoryItemForm itemId={item.id} /></div>)}</article> : null}
      </aside>
    </div>
  </section>;
}

function Metric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) { return <div className={`card ${styles.metric}`}><span className={styles.metricLabel}>{label}</span><strong className={`${styles.metricValue} ${warning ? styles.metricWarning : ""}`}>{value}</strong></div>; }
