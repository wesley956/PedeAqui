import Link from "next/link";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DriverCreateForm, DriverUpdateForm } from "@/features/delivery/operation-forms";
import { DriverMobileAccessForm } from "@/features/delivery/driver-mobile-access-form";
import styles from "@/features/delivery/delivery.module.css";
import { DriverSettingsService } from "@/server/delivery/driver-settings-service";

const DRIVER_SETTINGS_REALTIME_TABLES = ["drivers", "deliveries"] as const;

export default async function DriverSettingsPage() {
  const data = await DriverSettingsService.load();

  return <section className={styles.page}>
    <header className={styles.header}>
      <div>
        <p className="muted">CONFIGURAÇÕES · ENTREGA</p>
        <h1>Entregadores</h1>
        <p className="muted">Cadastre o telefone do entregador e libere um primeiro acesso simples pelo WhatsApp. Depois ele entra somente com telefone + PIN.</p>
        <DeliveryRealtime storeId={data.context.storeId!} showStatus tables={DRIVER_SETTINGS_REALTIME_TABLES} />
      </div>
      <div className={styles.headerActions}><Link href="/entregas" className={styles.secondaryLink}>Voltar às entregas</Link></div>
    </header>

    <section className={styles.driverSettings}>
      <h2 style={{ margin: 0 }}>Novo entregador</h2>
      <p className="muted" style={{ margin: 0 }}>Novos cadastros entram ativos e em serviço para aparecerem imediatamente na lista de atribuição. Informe o telefone para liberar o acesso mobile.</p>
      <DriverCreateForm />
    </section>

    <section className={styles.driverSettings}>
      <h2 style={{ margin: 0 }}>Equipe de entrega</h2>
      {data.drivers.length === 0 ? <p className="muted">Nenhum entregador cadastrado.</p> : data.drivers.map((driver) => <article className={styles.driver} key={driver.id}>
        <div className={styles.driverHead}><div><strong>{driver.name}</strong><div className={styles.driverMeta}>{driver.active ? (driver.on_duty ? "Em serviço" : "Fora de serviço") : "Inativo"}{driver.user_id ? " · acesso mobile vinculado" : " · acesso mobile pendente"}</div></div><strong>{driver.activeDeliveries}/{driver.max_active_deliveries}</strong></div>
        <DriverUpdateForm driver={driver} />
        <DriverMobileAccessForm driver={driver} />
      </article>)}
    </section>
  </section>;
}
