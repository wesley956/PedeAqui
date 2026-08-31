import "server-only";

import { MissingOrganizationError } from "@/server/access/context";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { PERMISSIONS } from "@/server/access/permissions";
import { resolveOperationalStartRoute } from "@/components/layout/start-route";
import { SubscriptionLifecycleService } from "@/server/billing/subscription-lifecycle-service";

export class StartRouteService {
  static async resolve() {
    try {
      const access = await NavigationAccessService.load();
      const subscription = await SubscriptionLifecycleService.accessForOrganization(access.context.organizationId);
      if (!subscription.operationalAccess) {
        return access.permissionKeys.includes(PERMISSIONS.SUBSCRIPTION_VIEW) ? "/assinatura" : "/acesso-negado?reason=subscription";
      }
      return resolveOperationalStartRoute(access.operationalContexts, access.items);
    } catch (error) {
      if (error instanceof MissingOrganizationError) return "/onboarding";
      throw error;
    }
  }
}
