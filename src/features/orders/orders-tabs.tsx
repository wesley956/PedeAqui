import { PageTabs } from "@/components/ui/page-tabs";

/** Três jeitos de ver os mesmos pedidos, lado a lado: quadro completo, fila rápida (Modo Movimento) e histórico. */
export function OrdersTabs({ active, activeCount }: { active: "quadro" | "fila" | "historico"; activeCount?: number }) {
  return (
    <PageTabs
      label="Visões dos pedidos"
      active={active}
      tabs={[
        { key: "quadro", label: "Quadro", href: "/pedidos", count: activeCount ?? null },
        { key: "fila", label: "Fila rápida", href: "/movimento" },
        { key: "historico", label: "Histórico", href: "/pedidos/historico" },
      ]}
    />
  );
}
