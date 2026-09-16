import type { UnifiedRouterTool } from "@/server/intelligence/unified-router";

export type LegacyIntelligenceDecision = {
  intent: string;
  tool: UnifiedRouterTool;
};

export type LegacyIntelligenceObserver = (decision: LegacyIntelligenceDecision) => void;
