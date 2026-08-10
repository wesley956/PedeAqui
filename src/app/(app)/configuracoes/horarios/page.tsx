import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addStoreHourAction, removeStoreHourAction } from "@/features/menu/actions";
import { StoreMenuService } from "@/server/menu/store-menu-service";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export default async function StoreHoursPage() {
  const hours = await StoreMenuService.listHours();

  return (
    <section style={{ display: "grid", gap: 20, maxWidth: 900 }}>
      <header>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Configurações</p>
        <h1 style={{ margin: "4px 0" }}>Horários de funcionamento</h1>
        <p className="muted" style={{ margin: 0 }}>Cadastre mais de um período por dia. Fechamento após meia-noite é suportado.</p>
      </header>

      <form action={addStoreHourAction} className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
        <h2 style={{ margin: 0 }}>Adicionar período</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Dia</strong>
            <select name="weekday" defaultValue="1" style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "10px 12px" }}>
              {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <Input label="Abre" name="opensAt" type="time" required />
          <Input label="Fecha" name="closesAt" type="time" required />
          <Input label="Ordem" name="sortOrder" type="number" min={0} defaultValue={0} />
        </div>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" name="closesNextDay" />
          <span>Fecha no dia seguinte</span>
        </label>
        <div><Button type="submit">Adicionar horário</Button></div>
      </form>

      <article className="card" style={{ overflow: "hidden" }}>
        {hours.length === 0 ? (
          <div style={{ padding: 24 }}>
            <strong>Nenhum horário cadastrado</strong>
            <p className="muted" style={{ marginBottom: 0 }}>O cardápio ficará visível, mas a loja será considerada fechada até existir um período ativo.</p>
          </div>
        ) : hours.map((hour) => (
          <div key={hour.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 16, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
            <div>
              <strong>{weekdays[hour.weekday]}</strong>
              <div className="muted" style={{ marginTop: 4 }}>{hour.opens_at.slice(0, 5)} → {hour.closes_at.slice(0, 5)}{hour.closes_next_day ? " (+1 dia)" : ""}</div>
            </div>
            <form action={removeStoreHourAction}>
              <input type="hidden" name="hourId" value={hour.id} />
              <Button tone="danger" type="submit">Remover</Button>
            </form>
          </div>
        ))}
      </article>
    </section>
  );
}
