import "server-only";

import { after } from "next/server";
import { runCampaignWorker } from "@/server/growth/campaign-worker";
import { logger } from "@/server/observability/logger";

export function scheduleCampaignWorker(reason: string) {
  after(async () => {
    try {
      for (let batch = 0; batch < 4; batch += 1) {
        const result = await runCampaignWorker({ limit: 20 });
        if (result.claimed < 20) break;
      }
    }
    catch (error) { logger.warn("campaign_dispatch_failed", { reason, errorType: error instanceof Error ? error.name : "unknown" }); }
  });
}
