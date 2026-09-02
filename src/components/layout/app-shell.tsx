import type { CSSProperties, ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { DesktopNavigation, type ShellNavigationItem } from "@/components/layout/desktop-navigation";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { OperationTopbar } from "@/components/layout/operation-topbar";
import type { OperationalContext } from "@/components/layout/navigation-model";
import { OrderAlertProvider } from "@/features/orders/use-order-alert";
import { NewUserGuide } from "@/features/user-guide/new-user-guide";
import type { UserGuideStep } from "@/features/user-guide/guide-model";
import type { ExperienceMode } from "@/modules/user-experience";
import type { OperationHeaderData } from "@/server/access/operation-header-service";
import type { UserGuideState } from "@/server/onboarding/user-guide-service";
import type { ResolvedBranding } from "@/server/platform/branding-read-service";

export function AppShell({ children, email, branding, navigationItems, operationalContexts, operationHeader, userGuide, guideSteps, experienceMode, storeId }: { children: ReactNode; email: string | null; branding: ResolvedBranding; navigationItems: readonly ShellNavigationItem[]; operationalContexts: readonly OperationalContext[]; operationHeader: OperationHeaderData; userGuide: UserGuideState; guideSteps: readonly UserGuideStep[]; experienceMode: ExperienceMode; storeId: string | null }) {
  const style = {
    ...(branding.primaryColor ? { "--accent": branding.primaryColor } : {}),
    ...(branding.secondaryColor ? { "--accent-strong": branding.secondaryColor } : {}),
  } as CSSProperties;
  const usesPlatformDefault = branding.productName === "PedeAqui" && !branding.logoUrl;
  const driverOnly = operationalContexts.length === 1 && operationalContexts[0] === "delivery";

  return (
    <OrderAlertProvider storeId={storeId}>
      <div className="app-shell" style={style} data-experience={experienceMode}>
        <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
        <aside className="app-sidebar">
          <div className="brand-row" aria-label={branding.productName}>
            {usesPlatformDefault ? <PedeAquiLogo size="sm" decorative /> : <>
              {branding.logoUrl ? <img src={branding.logoUrl} alt="" width={32} height={32} className="brand-logo-image" /> : <div className="brand-mark" aria-hidden>{branding.productName.slice(0, 1).toUpperCase()}</div>}
              <strong className="brand-wordmark"><span>{branding.productName}</span></strong>
            </>}
          </div>
          <DesktopNavigation items={navigationItems} experienceMode={experienceMode} />
        </aside>
        <div className="app-main">
          <OperationTopbar email={email} data={operationHeader} storeId={storeId} experienceMode={experienceMode} driverOnly={driverOnly} />
          <main id="main-content" className="app-content" tabIndex={-1}>{children}</main>
          {!branding.hidePedeAquiBranding && !usesPlatformDefault ? <footer className="platform-footer" aria-label="Tecnologia PedeAqui"><span>Tecnologia</span><PedeAquiLogo size="xs" decorative /></footer> : null}
        </div>
        <MobileNavigation items={navigationItems} contexts={operationalContexts} experienceMode={experienceMode} />
        <NewUserGuide initialStatus={userGuide.status} initialStep={userGuide.currentStep} autoOpen={userGuide.autoOpen} steps={guideSteps} />
      </div>
    </OrderAlertProvider>
  );
}
