import { signOutAction } from "@/features/auth/actions";
import { setExperienceModeAction } from "@/features/preferences/actions";
import { Button } from "@/components/ui/button";
import type { ExperienceMode } from "@/modules/user-experience";
import type { OperationHeaderData } from "@/server/access/operation-header-service";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { OperationalHealthIndicator } from "@/features/operations/operational-health-indicator";
import Link from "next/link";
import { ReceivingControl } from "@/features/operations/receiving-control";

function storeStatusLabel(status: string | null) {
  if (status === "active") return "Unidade ativa";
  if (status === "inactive") return "Unidade inativa";
  return null;
}

export function OperationTopbar({ email, data, storeId, experienceMode = "standard", driverOnly = false }: { email: string | null; data: OperationHeaderData; storeId: string | null; experienceMode?: ExperienceMode; driverOnly?: boolean }) {
  const storeLabel = data.storeName ?? "Operação";
  const storeStatus = storeStatusLabel(data.storeStatus);
  const cashLabel = data.cashStatus === "open"
    ? `Caixa aberto${data.cashRegisterName ? ` · ${data.cashRegisterName}` : ""}`
    : data.cashStatus === "closed" ? "Caixa não aberto por você" : null;
  const nextExperienceMode: ExperienceMode = experienceMode === "easy" ? "standard" : "easy";

  return (
    <header className="app-topbar" data-driver-only={driverOnly}>
      <div className="app-topbar-context">
        <strong>{storeLabel}</strong>
        <div className="app-topbar-signals" aria-label="Estado da operação">
          {storeStatus ? <span>{storeStatus}</span> : null}
          {cashLabel ? <span data-state={data.cashStatus}>{cashLabel}</span> : null}
          {!storeStatus && !cashLabel ? <span>Operação disponível</span> : null}
        </div>
      </div>
      <div className="app-topbar-actions">
        {data.receiving ? <ReceivingControl state={data.receiving} /> : null}
        {!driverOnly ? <Link className="app-operation-link" href="/operacao">Abrir/fechar</Link> : null}
        <OperationalHealthIndicator storeId={storeId} snapshot={data.health} />
        <form action={setExperienceModeAction} className="app-experience-toggle">
          <input type="hidden" name="mode" value={nextExperienceMode} />
          <Button tone="ghost" type="submit" aria-label={experienceMode === "easy" ? "Voltar ao modo padrão" : "Ativar modo fácil"}>
            {experienceMode === "easy" ? "Modo padrão" : "Modo fácil"}
          </Button>
        </form>
        <ThemeSelector compact />
        {email ? <span className="muted app-user-email">{email}</span> : null}
        <form action={signOutAction}><Button tone="secondary" type="submit">Sair</Button></form>
      </div>
    </header>
  );
}
