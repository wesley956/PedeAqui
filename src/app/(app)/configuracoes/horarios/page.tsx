import { StoreMenuService } from "@/server/menu/store-menu-service";
import { PageHeader } from "@/components/ui/page-header";
import { WeekGrid, type WeekPeriod } from "./week-grid";

export default async function StoreHoursPage() {
  const hours = await StoreMenuService.listHours();
  const periods: WeekPeriod[] = hours.map((hour) => ({ weekday: hour.weekday, opensAt: hour.opens_at.slice(0, 5), closesAt: hour.closes_at.slice(0, 5) }));

  return (
    <section>
      <PageHeader title="Horários de funcionamento" description="Marque os dias abertos, ajuste os horários e salve a semana inteira de uma vez. Dá para ter mais de um período por dia." />
      {hours.length === 0 ? (
        <p className="muted">Nenhum horário cadastrado. O cardápio fica visível, mas a loja é considerada fechada até existir um período.</p>
      ) : null}
      <WeekGrid periods={periods} />
    </section>
  );
}
