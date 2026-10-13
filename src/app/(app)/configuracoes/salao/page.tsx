import Link from "next/link";
import { createDiningTableAction } from "@/features/dining/actions";
import styles from "../settings-form.module.css";
import { Input, QuantityInput, Checkbox } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";
import { FormDisclosure } from "@/components/ui/form-disclosure";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { DiningService } from "@/server/dining/dining-service";
import { PageHeader } from "@/components/ui/page-header";

export default async function DiningSettingsPage() {
  await authorize(PERMISSIONS.DINING_MANAGE);
  const { tables } = await DiningService.listTables();

  return <section className={styles.page}>
    <PageHeader title="Mesas" description="Cadastre a estrutura do salão fora do fluxo rápido do atendimento." actions={<Link href="/salao">Voltar ao salão</Link>} />

    <FormDisclosure className={styles.details} summary="Cadastrar mesa">
      <form action={createDiningTableAction} className={styles.form} aria-label="Cadastrar mesa">
        <div className={styles.grid}>
          <Input id="new-table-code" label="Código" name="code" required maxLength={32} placeholder="01" />
          <Input id="new-table-name" label="Nome" name="name" required maxLength={80} placeholder="Mesa 01" />
          <QuantityInput id="new-table-capacity" label="Capacidade" name="capacity" min={1} max={100} defaultValue={4} required />
          <Input id="new-table-area" label="Área" name="area" maxLength={80} placeholder="Salão principal" />
        </div>
        <Checkbox id="new-table-qr" name="qrEnabled" label="Habilitar pedidos por QR" />
        <div className={styles.actions}><Button type="submit" loadingLabel="Criando mesa…">Criar mesa</Button></div>
      </form>
    </FormDisclosure>

    <section className={styles.card}>
      <h2 style={{ margin: 0 }}>Estrutura atual</h2>
      {tables.length === 0 ? <p className={styles.meta}>Nenhuma mesa cadastrada.</p> : <div className={styles.entityLinks}>{tables.map((table) => <Link href={`/salao/${table.id}`} key={table.id}><strong>{table.name}</strong><span>{table.area || `${table.capacity} lugar(es)`}</span></Link>)}</div>}
      <p className={styles.meta}>Alterações de status, QR e demais ações de uma mesa continuam protegidas pelas permissões e regras existentes.</p>
    </section>
  </section>;
}
