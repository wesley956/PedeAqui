import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { buildUserGuideSteps } from "@/features/user-guide/guide-model";
import { moduleKeyForPathname } from "@/modules/module-routing";
import { getAuthenticatedUser, requireAuthenticatedUser } from "@/server/auth/session";
import { MissingOrganizationError } from "@/server/access/context";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { OperationHeaderService, type OperationHeaderData } from "@/server/access/operation-header-service";
import { OnboardingReadinessService, type OnboardingReadiness } from "@/server/onboarding/onboarding-readiness-service";
import { UserGuideService } from "@/server/onboarding/user-guide-service";
import { BrandingReadService, type ResolvedBranding } from "@/server/platform/branding-read-service";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pedeaqui-pathname") ?? "";
  const existingUser = await getAuthenticatedUser();
  if (!existingUser && (pathname === "/entregador" || pathname.startsWith("/entregador/"))) {
    redirect("/acesso-entregador");
  }
  const user = await requireAuthenticatedUser();
  let branding: ResolvedBranding;
  let operationHeader: OperationHeaderData;
  let onboardingReadiness: OnboardingReadiness;
  let navigationAccess: Awaited<ReturnType<typeof NavigationAccessService.load>>;

  try {
    navigationAccess = await NavigationAccessService.load();
    const driverOnly = navigationAccess.operationalContexts.length === 1 && navigationAccess.operationalContexts[0] === "delivery";
    if (driverOnly && pathname && pathname !== "/entregador" && !pathname.startsWith("/entregador/")) {
      redirect("/entregador");
    }
    const moduleKey = moduleKeyForPathname(pathname);
    if (moduleKey) {
      const availability = navigationAccess.moduleAvailability[moduleKey];
      if (!availability.available) {
        if (availability.reason === "permission_denied") redirect("/acesso-negado");
        redirect(`/recurso-indisponivel?module=${moduleKey}&reason=${availability.reason}`);
      }
    }
    [branding, operationHeader, onboardingReadiness] = await Promise.all([
      BrandingReadService.resolve(navigationAccess.context.organizationId),
      OperationHeaderService.load(navigationAccess),
      OnboardingReadinessService.load(navigationAccess.context),
    ]);
  } catch (error) {
    if (error instanceof MissingOrganizationError) redirect("/onboarding");
    throw error;
  }

  const userGuide = await UserGuideService.load(user.id);
  const guideSteps = buildUserGuideSteps(
    navigationAccess.items,
    navigationAccess.roleKeys,
    navigationAccess.businessType,
    onboardingReadiness,
  );

  return (
    <AppShell
      email={user.email}
      branding={branding}
      navigationItems={navigationAccess.items}
      operationalContexts={navigationAccess.operationalContexts}
      operationHeader={operationHeader}
      userGuide={userGuide}
      guideSteps={guideSteps}
      experienceMode={navigationAccess.experienceMode}
      storeId={navigationAccess.context.storeId}
    >
      {children}
    </AppShell>
  );
}
