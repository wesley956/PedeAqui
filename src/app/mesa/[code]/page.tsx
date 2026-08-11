import { notFound } from "next/navigation";
import { DiningRoundComposer } from "@/features/dining/round-composer";
import styles from "@/features/dining/dining.module.css";
import { PublicDiningService } from "@/server/dining/public-dining-service";

export default async function PublicTablePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const state = await PublicDiningService.load(code);
  if (!state) notFound();
  return <main style={{ minHeight: "100vh", background: "#fffdf9" }}><div className={styles.public}>
    <header className={styles.publicHeader}><div><div style={{ color: "#ff6b00", fontWeight: 950 }}>PedeAqui</div><h1 style={{ margin: "4px 0" }}>{state.table.name}</h1><div style={{ color: "#716b64" }}>{state.store.name} · Comanda {state.tab ? `#${state.tab.display_number}` : "indisponível"}</div></div></header>
    <section className={styles.publicBody}>{state.canOrder ? <><h2 style={{ marginTop: 0 }}>Pedir na mesa</h2><p style={{ color: "#716b64" }}>Monte sua rodada. O pedido vai direto para a produção desta mesa.</p><DiningRoundComposer categories={state.categories} products={state.products} publicCode={code} compact /></> : <><h2>Chame a equipe</h2><p>Esta mesa ainda não possui uma comanda aberta para pedidos por QR.</p></>}</section>
  </div></main>;
}
