import { randomUUID } from "node:crypto";
import {
  AgentReconnectInstallerClient,
  AgentTokenCreatorClient,
} from "@/features/printing/agent-token-creator-client";

export function AgentTokenCreator() {
  return <AgentTokenCreatorClient intentSeed={randomUUID()} />;
}

export function AgentReconnectInstaller({
  agentId,
  upgrade = false,
}: {
  agentId: string;
  upgrade?: boolean;
}) {
  return (
    <AgentReconnectInstallerClient
      agentId={agentId}
      upgrade={upgrade}
      intentSeed={randomUUID()}
    />
  );
}
