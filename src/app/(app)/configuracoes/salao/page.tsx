import Link from "next/link";
import { createDiningTableAction } from "@/features/dining/actions";
import styles from "@/features/dining/dining.module.css";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { DiningService } from "@/server/dining/dining-service";

export default async function DiningSettingsPage() {
  await authorize(PERMISSIONS.DINING_MANAGE);
  const { tables } = await DiningService.listTables();

  return <section className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.muted} style={{ margin: 0 }}>CONFIGURAÇÕES · SALÃO</p><h1>Mesas</h1><p className={styles.muted}>Cadastre a estrutura do salão fora do fluxo rápido do atendimento.</p></div>
      <Link href="/salao" className={styles.secondary}>Voltar ao salão</Link>
    </header>

    <section className={styles.panel}>
      <h2 style={{ margin: 0 }}>Cadastrar mesa</h2>
      <form action={createDiningTableAction} className={styles.formGrid}>
        <label className={styles.field}><span>Código</span><input name="code" required maxLength={32} placeholder="01" /></label>
        <label className={styles.field}><span>Nome</span><input name="name" required maxLength={80} placeholder="Mesa 01" /></label>
        <label className={styles.field}><span>Capacidade</span><input name="capacity" type="number" min={1} max={100} defaultValue={4} required /></label>
        <label className={styles.field}><span>Área</span><input name="area" maxLength={80} placeholder="Salão principal" /></label>
        <label className={styles.checkboxField}><input name="qrEnabled" type="checkbox" /> Habilitar pedidos por QR</label>
        <button className={styles.button} type="submit">Criar mesa</button>
      </form>
    </section>

    <section className={styles.panel}>
      <h2 style={{ margin: 0 }}>Estrutura atual</h2>
      {tables.length === 0 ? <p className={styles.muted}>Nenhuma mesa cadastrada.</p> : <div className={styles.settingsTableList}>{tables.map((table) => <Link href={`/salao/${table.id}`} key={table.id}><strong>{table.name}</strong><span>{table.area || `${table.capacity} lugar(es)`}</span></Link>)}</div>}
      <p className={styles.muted}>Alterações de status, QR e demais ações de uma mesa continuam protegidas pelas permissões e regras existentes.</p>
    </section>
  </section>;
}
