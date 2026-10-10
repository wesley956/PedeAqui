import { signOutAction } from "@/features/auth/actions";
import { setExperienceModeAction } from "@/features/preferences/actions";
import { Button } from "@/components/ui/button";
import { CustomerMessageNotifications } from "@/features/customer-messages/customer-message-notifications";
import type { ExperienceMode } from "@/modules/user-experience";
import type { OperationHeaderData } from "@/server/access/operation-header-service";
import type { CustomerPanelMessageState } from "@/server/platform/customer-panel-message-service";
import { ThemeSelector } from "@/components/theme/theme-selector";
import { OperationalHealthIndicator } from "@/features/operations/operational-health-indicator";
import Link from "next/link";
import { ReceivingControl } from "@/features/operations/receiving-control";

function storeStatusLabel(status: string | null) {
  if (status === "active") return "Unidade ativa";
  if (status === "inactive") return "Unidade inativa";
  return null;
}

export function OperationTopbar({ email, data, storeId, experienceMode = "standard", driverOnly = false, customerMessages }: { email: string | null; data: OperationHeaderData; storeId: string | null; experienceMode?: ExperienceMode; driverOnly?: boolean; customerMessages: CustomerPanelMessageState }) {
  const storeLabel = data.storeName ?? "Operação";
  const storeStatus = storeStatusLabel(data.storeStatus);
  const cashLabel = data.cashStatus === "open"
    ? `Caixa aberto${data.cashRegisterName ? ` · ${data.cashRegisterName}` : ""}`
    : data.cashStatus === "closed" ? "Caixa não aberto por você" : null;
  const nextExperienceMode: ExperienceMode = experienceMode === "easy" ? "standard" : "easy";

  return (
    <header className="app-topbar app-topbar-compact" data-driver-only={driverOnly}>
      <details className="app-operation-menu">
        <summary aria-label="Operação da loja" title={storeLabel}>
          <strong>{storeLabel}</strong>
          {data.receiving ? <span className="app-receiving-dot" data-accepting={data.receiving.accepting} role="img" aria-label={data.receiving.accepting ? "Recebimento de pedidos ativo" : "Pedidos pausados"} title={data.receiving.accepting ? "Recebimento de pedidos ativo" : "Pedidos pausados"} /> : null}
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="app-topbar-panel app-operation-panel">
          <strong>{storeLabel}</strong>
          <div className="app-topbar-signals" aria-label="Estado da operação">
            {storeStatus ? <span>{storeStatus}</span> : null}
            {cashLabel ? <span data-state={data.cashStatus}>{cashLabel}</span> : null}
            {!storeStatus && !cashLabel ? <span>Operação disponível</span> : null}
          </div>
          {data.receiving ? <ReceivingControl state={data.receiving} /> : null}
          {!driverOnly ? <div className="app-operation-panel-links"><Link className="app-operation-link" href="/movimento">Modo Movimento</Link><Link className="app-operation-link" href="/operacao">Abrir/fechar</Link></div> : null}
        </div>
      </details>
      <div className="app-topbar-actions">
        {!driverOnly ? <Link className="app-operation-link app-movement-shortcut" href="/movimento" aria-label="Modo Movimento" title="Modo Movimento"><span aria-hidden="true">↗</span><span className="app-movement-label">Modo Movimento</span></Link> : null}
        <OperationalHealthIndicator storeId={storeId} snapshot={data.health} />
        <CustomerMessageNotifications state={customerMessages} />
        <details className="app-account-menu">
          <summary aria-label="Conta e preferências" title="Conta e preferências">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>
          </summary>
          <div className="app-topbar-panel app-account-panel">
            {email ? <span className="muted app-user-email">{email}</span> : null}
            <form action={setExperienceModeAction} className="app-experience-toggle">
              <input type="hidden" name="mode" value={nextExperienceMode} />
              <Button tone="ghost" type="submit" aria-label={experienceMode === "easy" ? "Voltar ao modo padrão" : "Ativar modo fácil"}>
                {experienceMode === "easy" ? "Modo padrão" : "Modo fácil"}
              </Button>
            </form>
            <ThemeSelector compact />
            <form action={signOutAction}><Button tone="secondary" type="submit">Sair</Button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
