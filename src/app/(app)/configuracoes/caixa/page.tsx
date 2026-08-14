import Link from "next/link";
import { createCashRegisterAction, updateCashRegisterAction } from "@/features/cash/actions";
import styles from "@/features/cash/cash.module.css";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { CashService } from "@/server/cash/cash-service";

export default async function CashSettingsPage() {
  await authorize(PERMISSIONS.CASH_MANAGE);
  const data = await CashService.loadDashboard();
  const openByRegister = new Map(data.sessions.filter((session) => session.status === "open").map((session) => [session.cash_register_id, session]));

  return <section className={styles.page}>
    <header className={styles.header}><div><p className={styles.muted}>CONFIGURAÇÕES · CAIXA</p><h1>Caixas da unidade</h1><p className={styles.muted}>Cadastre e mantenha os pontos físicos de caixa fora do fluxo do turno.</p></div><div className={styles.headerActions}><Link href="/caixa" className={styles.secondary}>Voltar ao caixa</Link></div></header>

    <article className={styles.panel}>
      <h2>Criar caixa</h2>
      <form action={createCashRegisterAction} className={styles.formGrid}>
        <label className={styles.field}><span>CÓDIGO</span><input className={styles.input} name="code" required maxLength={32} placeholder="01" /></label>
        <label className={styles.field}><span>NOME</span><input className={styles.input} name="name" required maxLength={80} placeholder="Caixa principal" /></label>
        <button className={styles.primary} type="submit">Criar caixa</button>
      </form>
    </article>

    <article className={styles.panel}>
      <h2>Caixas cadastrados</h2>
      {data.registers.length === 0 ? <p className={styles.muted}>Nenhum caixa configurado.</p> : <div className={styles.settingsList}>{data.registers.map((register) => {
        const open = openByRegister.get(register.id);
        return <div className={styles.register} key={register.id}>
          <div className={styles.registerHeader}><div><strong>{register.code} · {register.name}</strong><div className={styles.muted}>{register.active ? "Ativo" : "Desativado"}{open ? " · turno aberto" : " · livre"}</div></div></div>
          <form action={updateCashRegisterAction.bind(null, register.id)} className={styles.formGrid}>
            <label className={styles.field}><span>NOME</span><input className={styles.input} name="name" defaultValue={register.name} required maxLength={80} /></label>
            <label className={styles.checkbox}><input type="checkbox" name="active" defaultChecked={register.active} /> Ativo</label>
            <button className={styles.secondary} type="submit">Salvar</button>
          </form>
        </div>;
      })}</div>}
    </article>
  </section>;
}
