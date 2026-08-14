import "server-only";

import { MissingOrganizationError } from "@/server/access/context";
import { NavigationAccessService } from "@/server/access/navigation-access-service";
import { resolveOperationalStartRoute } from "@/components/layout/start-route";

export class StartRouteService {
  static async resolve() {
    try {
      const access = await NavigationAccessService.load();
      return resolveOperationalStartRoute(access.operationalContexts, access.items);
    } catch (error) {
      if (error instanceof MissingOrganizationError) return "/onboarding";
      throw error;
    }
  }
}
