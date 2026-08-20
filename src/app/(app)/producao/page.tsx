import { KitchenBoard } from "@/features/kitchen/kitchen-board";
import { businessVocabulary } from "@/modules/business-vocabulary";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { KitchenService } from "@/server/kitchen/kitchen-service";

export default async function ProductionPage() {
  const [access, snapshot] = await Promise.all([
    NavigationAccessService.load(),
    KitchenService.snapshot(),
  ]);
  const vocabulary = businessVocabulary(access.businessType);

  return (
    <section style={{ display: "grid", gap: "var(--space-4)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <p className="muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>OPERAÇÃO · TEMPO REAL</p>
          <h1 style={{ margin: "var(--space-1) 0" }}>{vocabulary.productionLabel}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: "var(--content-reading)" }}>{vocabulary.productionDescription}</p>
        </div>
        <div className="muted" style={{ fontSize: "var(--font-size-sm)" }}>{snapshot.stations.length} estação(ões) ativa(s)</div>
      </header>

      <KitchenBoard storeId={snapshot.storeId} stations={snapshot.stations} orders={snapshot.orders} initialNow={snapshot.snapshotAt} businessType={access.businessType} />
    </section>
  );
}
