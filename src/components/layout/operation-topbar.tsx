import { signOutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import type { OperationHeaderData } from "@/server/access/operation-header-service";
import { ThemeSelector } from "@/components/theme/theme-selector";

function storeStatusLabel(status: string | null) {
  if (status === "active") return "Unidade ativa";
  if (status === "inactive") return "Unidade inativa";
  return null;
}

export function OperationTopbar({ email, data }: { email: string | null; data: OperationHeaderData }) {
  const storeLabel = data.storeName ?? "Operação";
  const storeStatus = storeStatusLabel(data.storeStatus);
  const cashLabel = data.cashStatus === "open"
    ? `Caixa aberto${data.cashRegisterName ? ` · ${data.cashRegisterName}` : ""}`
    : data.cashStatus === "closed"
      ? "Caixa não aberto por você"
      : null;

  return (
    <header className="app-topbar">
      <div className="app-topbar-context">
        <strong>{storeLabel}</strong>
        <div className="app-topbar-signals" aria-label="Estado da operação">
          {storeStatus ? <span>{storeStatus}</span> : null}
          {cashLabel ? <span data-state={data.cashStatus}>{cashLabel}</span> : null}
          {!storeStatus && !cashLabel ? <span>Operação disponível</span> : null}
        </div>
      </div>
      <div className="app-topbar-actions">
        <ThemeSelector compact />
        {email ? <span className="muted app-user-email">{email}</span> : null}
        <form action={signOutAction}><Button tone="secondary" type="submit">Sair</Button></form>
      </div>
    </header>
  );
}
