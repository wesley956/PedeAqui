import Link from "next/link";
import { createDiningTableAction } from "@/features/dining/actions";
import styles from "@/features/dining/dining.module.css";
import { DiningService } from "@/server/dining/dining-service";
import { occupiedMinutes } from "@/server/dining/model";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const statusLabel: Record<string, string> = { available: "Livre", occupied: "Ocupada", reserved: "Reservada", cleaning: "Limpeza", disabled: "Desativada" };

export default async function DiningPage() {
  const { tables } = await DiningService.listTables();
  return <div className={styles.page}>
    <header className={styles.header}><div><p className={styles.muted} style={{ margin: 0 }}>OPERAÇÃO DE SALÃO</p><h1>Mesas e comandas</h1><p className={styles.muted}>Abra mesas, acompanhe consumo e feche contas usando o mesmo motor de pedidos do PedeAqui.</p></div></header>
    <section className={styles.tableGrid}>
      {tables.map((table) => <Link href={`/salao/${table.id}`} key={table.id} className={styles.tableCard}>
        <div className={styles.cardTop}><strong>{table.name}</strong><span className={styles.status}>{statusLabel[table.status] ?? table.status}</span></div>
        <div><span className={styles.muted}>{table.area || `Mesa ${table.code}`}</span>{table.tab ? <><div className={styles.metric}>{money(table.due_cents)}</div><div className={styles.muted}>Comanda #{table.tab.display_number} · {table.tab.guest_count} pessoa(s)</div><div className={styles.muted}>{occupiedMinutes(table.tab.opened_at)} min aberta</div></> : <div className={styles.muted} style={{ marginTop: 18 }}>Sem comanda ativa</div>}</div>
      </Link>)}
      {!tables.length ? <div className={styles.panel}><strong>Nenhuma mesa cadastrada</strong><span className={styles.muted}>Cadastre a primeira mesa abaixo.</span></div> : null}
    </section>
    <section className={styles.panel}><h2 style={{ margin: 0 }}>Cadastrar mesa</h2><form action={createDiningTableAction} className={styles.formGrid}>
      <label className={styles.field}><span>Código</span><input name="code" required maxLength={32} placeholder="01" /></label>
      <label className={styles.field}><span>Nome</span><input name="name" required maxLength={80} placeholder="Mesa 01" /></label>
      <label className={styles.field}><span>Capacidade</span><input name="capacity" type="number" min={1} max={100} defaultValue={4} required /></label>
      <label className={styles.field}><span>Área</span><input name="area" maxLength={80} placeholder="Salão principal" /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input name="qrEnabled" type="checkbox" /> Habilitar pedidos por QR</label>
      <button className={styles.button} type="submit">Criar mesa</button>
    </form></section>
  </div>;
}
