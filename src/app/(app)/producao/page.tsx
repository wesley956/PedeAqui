import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { KitchenService } from "@/server/kitchen/kitchen-service";
import styles from "./production.module.css";
import { PageHeader } from "@/components/ui/page-header";

export default async function ProductionPage() {
  const [access, snapshot] = await Promise.all([
    NavigationAccessService.load(),
    KitchenService.snapshot(),
  ]);
  const vocabulary = businessVocabulary(access.businessType);

  return (
    <section className={styles.page}>
      <PageHeader title={vocabulary.productionLabel} description={vocabulary.productionDescription} status={<span className={styles.stationBadge}>{snapshot.stations.length} estação(ões) ativa(s)</span>} />

      <KitchenBoard storeId={snapshot.storeId} stations={snapshot.stations} orders={snapshot.orders} initialNow={snapshot.snapshotAt} businessType={access.businessType} />
    </section>
  );
}
