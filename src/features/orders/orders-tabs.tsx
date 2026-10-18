import { PageTabs } from "@/components/ui/page-tabs";

/** Três jeitos de ver os mesmos pedidos, lado a lado: pedidos ativos, fila rápida (Modo Movimento) e histórico.
 * A aba se chama "Ativos" para não repetir o "Quadro" da troca de visualização (Fila / Lista / Quadro). */
export function OrdersTabs({ active, activeCount }: { active: "quadro" | "fila" | "historico"; activeCount?: number }) {
  return (
    <PageTabs
      label="Visões dos pedidos"
      active={active}
      tabs={[
        { key: "quadro", label: "Ativos", href: "/pedidos", count: activeCount ?? null },
        { key: "fila", label: "Fila rápida", href: "/movimento" },
        { key: "historico", label: "Histórico", href: "/pedidos/historico" },
      ]}
    />
  );
}
