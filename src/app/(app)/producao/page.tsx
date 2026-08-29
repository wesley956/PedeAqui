import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { KitchenService } from "@/server/kitchen/kitchen-service";
import styles from "./production.module.css";

export default async function ProductionPage() {
  const [access, snapshot] = await Promise.all([
    NavigationAccessService.load(),
    KitchenService.snapshot(),
  ]);
  const vocabulary = businessVocabulary(access.businessType);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERAÇÃO · TEMPO REAL</p>
          <h1>{vocabulary.productionLabel}</h1>
          <p>{vocabulary.productionDescription}</p>
        </div>
        <div className={styles.stationBadge}>{snapshot.stations.length} estação(ões) ativa(s)</div>
      </header>

      <KitchenBoard storeId={snapshot.storeId} stations={snapshot.stations} orders={snapshot.orders} initialNow={snapshot.snapshotAt} businessType={access.businessType} />
    </section>
  );
}
