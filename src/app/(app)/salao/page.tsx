import Link from "next/link";
import styles from "@/features/dining/dining.module.css";
import { DiningService } from "@/server/dining/dining-service";
import { occupiedMinutes } from "@/server/dining/model";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const statusLabel: Record<string, string> = { available: "Livre", occupied: "Ocupada", reserved: "Reservada", cleaning: "Limpeza", disabled: "Desativada" };

export default async function DiningPage() {
  const { tables } = await DiningService.listTables();
  const active = tables.filter((table) => table.tab);
  const settling = active.filter((table) => table.tab?.status === "settling");

  return <div className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className={styles.muted} style={{ margin: 0 }}>OPERAÇÃO DE SALÃO</p>
        <h1>Mesas</h1>
        <p className={styles.muted}>Veja rapidamente ocupação, tempo de sessão, consumo e mesas que já pediram a conta.</p>
      </div>
      <Link href="/configuracoes/salao" className={styles.secondary}>Configurar mesas</Link>
    </header>

    <div className={styles.diningSummary} aria-label="Resumo do salão">
      <span><strong>{tables.length - active.length}</strong> livres</span>
      <span><strong>{active.length}</strong> em atendimento</span>
      <span data-attention={settling.length > 0 ? "true" : undefined}><strong>{settling.length}</strong> com conta solicitada</span>
    </div>

    <section className={styles.tableGrid} aria-label="Mesas da unidade">
      {tables.map((table) => {
        const tab = table.tab;
        const isSettling = tab?.status === "settling";
        const visualStatus = isSettling ? "settling" : table.status;
        return <Link href={`/salao/${table.id}`} key={table.id} className={styles.tableCard} data-table-status={visualStatus}>
          <div className={styles.cardTop}>
            <strong className={styles.tableName}>{table.name}</strong>
            <span className={styles.status} data-table-status={visualStatus}>{isSettling ? "Conta solicitada" : statusLabel[table.status] ?? table.status}</span>
          </div>
          <div className={styles.tableMeta}>{table.area || `${table.capacity} lugar(es)`}</div>
          {tab ? <>
            <div className={styles.metric}>{money(table.due_cents)}</div>
            <div className={styles.sessionMeta}><span>{tab.guest_count} pessoa(s)</span><span>{occupiedMinutes(tab.opened_at)} min</span></div>
            <div className={styles.muted}>Comanda #{tab.display_number}</div>
          </> : <div className={styles.freeState}>Toque para iniciar atendimento</div>}
        </Link>;
      })}
      {!tables.length ? <div className={styles.panel}><strong>Nenhuma mesa cadastrada</strong><span className={styles.muted}>Cadastre mesas em Configurações → Salão.</span><Link href="/configuracoes/salao" className={styles.button}>Configurar salão</Link></div> : null}
    </section>
  </div>;
}
