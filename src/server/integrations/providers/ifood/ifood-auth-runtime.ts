import "server-only";

import { IfoodAuthHttpClient } from "@/server/integrations/providers/ifood/ifood-auth-http-client";
import { IfoodAuthRepository } from "@/server/integrations/providers/ifood/ifood-auth-repository";
import { IfoodAuthService } from "@/server/integrations/providers/ifood/ifood-auth-service";

export function createIfoodAuthService() {
  return new IfoodAuthService(new IfoodAuthRepository(), new IfoodAuthHttpClient());
}
