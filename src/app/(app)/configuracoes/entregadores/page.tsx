import Link from "next/link";
import { DeliveryRealtime } from "@/features/delivery/delivery-realtime";
import { DriverCreateForm, DriverUpdateForm } from "@/features/delivery/operation-forms";
import { DriverMobileAccessForm } from "@/features/delivery/driver-mobile-access-form";
import styles from "../settings-form.module.css";
import { FormDisclosure } from "@/components/ui/form-disclosure";
import { DriverSettingsService } from "@/server/delivery/driver-settings-service";

const DRIVER_SETTINGS_REALTIME_TABLES = ["drivers", "deliveries"] as const;

export default async function DriverSettingsPage() {
  const data = await DriverSettingsService.load();

  return <section className={styles.page}>
    <header className={styles.header}>
      <div>
        <h1>Entregadores</h1>
        <p className="muted">Cadastre o telefone do entregador e libere um primeiro acesso simples pelo WhatsApp. Depois ele entra somente com telefone + PIN.</p>
        <DeliveryRealtime storeId={data.context.storeId!} showStatus tables={DRIVER_SETTINGS_REALTIME_TABLES} />
      </div>
      <div className={styles.actions}><Link href="/entregas" >Voltar às entregas</Link></div>
    </header>

    <FormDisclosure className={styles.details} summary="Novo entregador">
      <p className="muted" style={{ margin: 0 }}>Novos cadastros entram ativos e em serviço para aparecerem imediatamente na lista de atribuição. Informe o telefone para liberar o acesso mobile.</p>
      <div className={styles.driverForms}><DriverCreateForm /></div>
    </FormDisclosure>

    <section className={styles.card}>
      <h2 style={{ margin: 0 }}>Equipe de entrega</h2>
      {data.drivers.length === 0 ? <p className="muted">Nenhum entregador cadastrado.</p> : data.drivers.map((driver) => <article className={styles.row} key={driver.id}>
        <div className={styles.rowTop}><div><strong>{driver.name}</strong><div className={styles.meta}>{driver.active ? (driver.on_duty ? "Em serviço" : "Fora de serviço") : "Inativo"}{driver.user_id ? " · acesso mobile vinculado" : " · acesso mobile pendente"}</div></div><strong>{driver.activeDeliveries}/{driver.max_active_deliveries}</strong></div>
        <FormDisclosure className={styles.details} summary={`Editar ${driver.name}`}>
          <div className={styles.driverForms}><DriverUpdateForm driver={driver} /></div>
        </FormDisclosure>
        <FormDisclosure className={styles.details} summary={`Acesso pelo celular de ${driver.name}`}>
          <div className={styles.driverForms}><DriverMobileAccessForm driver={driver} /></div>
        </FormDisclosure>
      </article>)}
    </section>
  </section>;
}
