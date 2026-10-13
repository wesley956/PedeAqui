import Link from "next/link";
import { createCashRegisterAction, updateCashRegisterAction } from "@/features/cash/actions";
import styles from "../settings-form.module.css";
import { Input, Checkbox } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";
import { FormDisclosure } from "@/components/ui/form-disclosure";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { CashService } from "@/server/cash/cash-service";
import { PageHeader } from "@/components/ui/page-header";

export default async function CashSettingsPage() {
  await authorize(PERMISSIONS.CASH_MANAGE);
  const data = await CashService.loadDashboard();
  const openByRegister = new Map(data.sessions.filter((session) => session.status === "open").map((session) => [session.cash_register_id, session]));

  return <section className={styles.page}>
    <PageHeader title="Caixas da unidade" description="Cadastre e mantenha os pontos físicos de caixa fora do fluxo do turno." actions={<Link href="/caixa">Voltar ao caixa</Link>} />

    <FormDisclosure className={styles.details} summary="Criar caixa">
      <form action={createCashRegisterAction} className={styles.form} aria-label="Criar caixa">
        <div className={styles.grid}>
          <Input id="new-register-code" label="Código" name="code" required maxLength={32} placeholder="01" />
          <Input id="new-register-name" label="Nome" name="name" required maxLength={80} placeholder="Caixa principal" />
        </div>
        <div className={styles.actions}><Button type="submit" loadingLabel="Criando caixa…">Criar caixa</Button></div>
      </form>
    </FormDisclosure>

    <article className={styles.card}>
      <h2>Caixas cadastrados</h2>
      {data.registers.length === 0 ? <p className={styles.meta}>Nenhum caixa configurado.</p> : <div className={styles.list}>{data.registers.map((register) => {
        const open = openByRegister.get(register.id);
        return <div className={styles.row} key={register.id}>
          <div className={styles.rowTop}><div><strong>{register.code} · {register.name}</strong><div className={styles.meta}>{register.active ? "Ativo" : "Desativado"}{open ? " · turno aberto" : " · livre"}</div></div></div>
          <FormDisclosure className={styles.details} summary={`Editar ${register.name}`}>
          <form action={updateCashRegisterAction.bind(null, register.id)} className={styles.form} aria-label={`Editar caixa ${register.name}`}>
            <Input id={`register-${register.id}-name`} label="Nome" name="name" defaultValue={register.name} required maxLength={80} />
            <Checkbox id={`register-${register.id}-active`} name="active" label="Ativo" defaultChecked={register.active} />
            <div className={styles.actions}><Button type="submit" loadingLabel="Salvando caixa…">Salvar caixa</Button></div>
          </form>
          </FormDisclosure>
        </div>;
      })}</div>}
    </article>
  </section>;
}
