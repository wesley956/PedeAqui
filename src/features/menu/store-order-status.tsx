import type { NextOpening } from "@/server/menu/schedule";

export function StoreOrderStatus({ operational }: { operational: {
  canOrder: boolean;
  label: "open" | "closed" | "paused";
  nextOpening?: NextOpening | null;
  pauseReason?: string | null;
} }) {
  if (operational.canOrder) return null;
  const message = operational.label === "paused"
    ? `Pedidos temporariamente pausados.${operational.pauseReason ? ` ${operational.pauseReason}` : ""}`
    : `Loja fechada agora.${operational.nextOpening ? ` Abre ${operational.nextOpening.label}.` : ""}`;
  return <div role="status" style={{ padding: 14, borderRadius: 14, background: "var(--state-warning-surface)", color: "var(--state-warning-text)", fontWeight: 700 }}>
    {message} Você pode consultar o cardápio e revisar seu carrinho. A confirmação estará disponível quando a loja voltar a aceitar pedidos.
  </div>;
}
