import { Button } from "@/components/ui/button";
import { Input, Checkbox, SelectField } from "@/components/ui/form-controls";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import styles from "../settings-form.module.css";
import { addStoreHourAction, removeStoreHourAction } from "@/features/menu/actions";
import { StoreMenuService } from "@/server/menu/store-menu-service";
import { PageHeader } from "@/components/ui/page-header";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default async function StoreHoursPage() {
  const hours = await StoreMenuService.listHours();

  return (
    <section className={styles.page}>
      <PageHeader title="Horários de funcionamento" description="Cadastre mais de um período por dia. Fechamento após meia-noite é suportado." />

      <details className={styles.details}>
        <summary>Adicionar período</summary>
      <form action={addStoreHourAction} className={styles.form} aria-label="Adicionar período">
        <div className={styles.grid}>
          <SelectField id="new-hour-weekday" label="Dia" name="weekday" defaultValue="1">
            {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
          </SelectField>
          <Input label="Abre" name="opensAt" type="time" required />
          <Input label="Fecha" name="closesAt" type="time" required />
          <Input label="Ordem" name="sortOrder" type="number" min={0} defaultValue={0} />
        </div>
        <Checkbox id="new-hour-next-day" name="closesNextDay" label="Fecha no dia seguinte" />
        <div><Button type="submit" loadingLabel="Adicionando período…">Adicionar horário</Button></div>
      </form>
      </details>

      <h2 style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>Períodos cadastrados</h2>
      <article className={styles.list}>
        {hours.length === 0 ? (
          <div className={styles.empty}>
            <strong>Nenhum horário cadastrado</strong>
            <p className="muted" style={{ marginBottom: 0 }}>O cardápio ficará visível, mas a loja será considerada fechada até existir um período ativo.</p>
          </div>
        ) : hours.map((hour) => (
          <div key={hour.id} className={`${styles.row} ${styles.rowTop}`}>
            <div>
              <strong>{weekdays[hour.weekday]}</strong>
              <div className={styles.meta}>{hour.opens_at.slice(0, 5)} → {hour.closes_at.slice(0, 5)}{hour.closes_next_day ? " (+1 dia)" : ""}</div>
            </div>
            <form action={removeStoreHourAction}>
              <input type="hidden" name="hourId" value={hour.id} />
              <ConfirmSubmitButton tone="secondary" size="md" confirmation={`Remover o período de ${weekdays[hour.weekday]}, das ${hour.opens_at.slice(0, 5)} às ${hour.closes_at.slice(0, 5)}?`}>Remover período</ConfirmSubmitButton>
            </form>
          </div>
        ))}
      </article>
    </section>
  );
}
