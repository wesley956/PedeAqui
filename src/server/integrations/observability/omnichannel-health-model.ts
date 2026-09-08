import type { ExternalCapabilityKey, IntegrationHealth, IntegrationProvider } from "@/server/integrations/core/capabilities";

export type OmnichannelFailureKind =
  | "provider_failure"
  | "provider_rate_limit"
  | "provider_auth"
  | "provider_contract"
  | "store_configuration"
  | "pedeaqui_internal"
  | "local_device";

export type OmnichannelQueueMetrics = {
  pending: number;
  retry: number;
  processing: number;
  deadLetter: number;
  oldestOpenAt: string | null;
  lastSuccessAt: string | null;
  lastFailureKind: string | null;
  lastFailure: string | null;
};

export type OmnichannelCapabilityHealth = {
  key: string;
  provider: IntegrationProvider;
  capability: ExternalCapabilityKey;
  organizationId: string;
  storeId: string;
  integrationAccountId: string;
  enabled: boolean;
  environment: "sandbox" | "production";
  connectionState: string;
  state: IntegrationHealth;
  failureKind: OmnichannelFailureKind | null;
  impact: string;
  lastHealthAt: string | null;
  lastEventReceivedAt: string | null;
  lastEventProcessedAt: string | null;
  ingestionLagSeconds: number | null;
  inbox: OmnichannelQueueMetrics;
  outbox: OmnichannelQueueMetrics;
  divergenceCount: number;
};

export type OmnichannelIncidentCandidate = {
  fingerprint: string;
  severity: "P0" | "P1" | "P2" | "P3";
  title: string;
  summary: string;
  category: "omnichannel";
  sourceKind: OmnichannelFailureKind | "integration_lag" | "integration_divergence" | "integration_dead_letter";
  sourceReference: string;
  organizationId: string;
  storeId: string;
};

function text(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

export function classifyOmnichannelFailure(input: {
  connectionState?: string | null;
  accountStatus?: string | null;
  lastErrorKind?: string | null;
  lastError?: string | null;
}): OmnichannelFailureKind | null {
  const value = text(input.connectionState, input.accountStatus, input.lastErrorKind, input.lastError);
  if (!value || value === "connected") return null;
  if (value.includes("action_required") || value.includes("auth") || value.includes("token") || value.includes("401") || value.includes("403") || value.includes("revoked")) return "provider_auth";
  if (value.includes("rate") || value.includes("429") || value.includes("retry-after")) return "provider_rate_limit";
  if (value.includes("schema") || value.includes("contract") || value.includes("payload") || value.includes("validation") || value.includes("422") || value.includes("unknown_enum")) return "provider_contract";
  if (value.includes("merchant") || value.includes("capability") || value.includes("configuration") || value.includes("not_connected") || value.includes("disconnected")) return "store_configuration";
  if (value.includes("print") || value.includes("printer") || value.includes("device")) return "local_device";
  if (value.includes("provider") || value.includes("timeout") || value.includes("5xx") || value.includes("500") || value.includes("502") || value.includes("503") || value.includes("unavailable")) return "provider_failure";
  return "pedeaqui_internal";
}

export function secondsBetween(newer: string | null, older: string | null): number | null {
  if (!newer || !older) return null;
  const result = Math.floor((new Date(newer).getTime() - new Date(older).getTime()) / 1000);
  return Number.isFinite(result) ? Math.max(0, result) : null;
}

export function secondsSince(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const result = Math.floor((now - new Date(value).getTime()) / 1000);
  return Number.isFinite(result) ? Math.max(0, result) : null;
}

export function resolveCapabilityHealthState(input: {
  enabled: boolean;
  accountStatus: string;
  connectionState: string;
  failureKind: OmnichannelFailureKind | null;
  inbox: OmnichannelQueueMetrics;
  outbox: OmnichannelQueueMetrics;
  divergenceCount: number;
  now?: number;
}): IntegrationHealth {
  if (!input.enabled) return "disconnected";
  if (input.accountStatus === "action_required" || input.connectionState === "action_required" || input.failureKind === "provider_auth") return "action_required";
  if (input.accountStatus === "unavailable") return "unavailable";
  if (input.inbox.deadLetter > 0 || input.outbox.deadLetter > 0 || input.divergenceCount > 0) return "attention";
  const oldest = [input.inbox.oldestOpenAt, input.outbox.oldestOpenAt]
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  if ((secondsSince(oldest, input.now) ?? 0) >= 240) return "attention";
  if (input.inbox.retry > 0 || input.outbox.retry > 0 || input.failureKind) return "attention";
  return input.accountStatus === "connected" && input.connectionState === "connected" ? "connected" : "attention";
}

export function humanCapabilityImpact(item: Pick<OmnichannelCapabilityHealth, "capability" | "enabled" | "state" | "inbox" | "outbox" | "divergenceCount">): string {
  if (!item.enabled) return "Capability desligada; histórico preservado e nenhuma nova operação deve ser iniciada.";
  if (item.state === "action_required") return "A operação desta capability está bloqueada até a autenticação/configuração ser corrigida.";
  if (item.state === "unavailable") return "Provider temporariamente indisponível para esta capability.";
  if (item.inbox.deadLetter + item.outbox.deadLetter > 0) return "Há item em dead-letter exigindo suporte/reprocessamento seguro.";
  if (item.divergenceCount > 0) return "Há pedido externo divergente que precisa de reconciliação.";
  if (item.state === "attention") return "Sincronização degradada; pedidos nativos e outras capabilities permanecem isolados.";
  return "Operação saudável dentro dos sinais observados.";
}

export function incidentCandidatesForCapability(item: OmnichannelCapabilityHealth, now = Date.now()): OmnichannelIncidentCandidate[] {
  if (!item.enabled) return [];
  const base = `omni:${item.provider}:${item.storeId}:${item.capability}`;
  const reference = `${item.provider}/${item.capability}/${item.integrationAccountId}`;
  const result: OmnichannelIncidentCandidate[] = [];
  if (item.failureKind === "provider_auth" || item.state === "action_required") {
    result.push({ fingerprint: `${base}:provider_auth`, severity: "P1", title: `${item.provider} exige nova autenticação`, summary: `${item.capability} não pode operar até a conexão ser recuperada.`, category: "omnichannel", sourceKind: "provider_auth", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  } else if (item.failureKind === "provider_rate_limit") {
    result.push({ fingerprint: `${base}:rate_limit`, severity: "P2", title: `${item.provider} aplicando rate limit`, summary: `${item.capability} está em retry controlado; não repetir comandos manualmente sem necessidade.`, category: "omnichannel", sourceKind: "provider_rate_limit", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  } else if (item.failureKind === "provider_failure" || item.state === "unavailable") {
    result.push({ fingerprint: `${base}:provider_failure`, severity: "P1", title: `${item.provider} indisponível`, summary: `${item.capability} está degradada; canal nativo deve permanecer isolado.`, category: "omnichannel", sourceKind: "provider_failure", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  } else if (item.failureKind === "provider_contract") {
    result.push({ fingerprint: `${base}:contract`, severity: "P1", title: `Contrato/payload inesperado em ${item.provider}`, summary: `${item.capability} recebeu dado incompatível e requer diagnóstico antes de reprocessar.`, category: "omnichannel", sourceKind: "provider_contract", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  }

  const oldest = [item.inbox.oldestOpenAt, item.outbox.oldestOpenAt].filter((value): value is string => Boolean(value)).sort()[0] ?? null;
  const lag = secondsSince(oldest, now) ?? 0;
  if (item.capability === "ifood_orders" && lag >= 300) {
    result.push({ fingerprint: `${base}:lag`, severity: lag >= 420 ? "P1" : "P2", title: "iFood Orders próximo do SLA", summary: `Há trabalho pendente há ${Math.floor(lag / 60)} min; confirmação deve permanecer abaixo do limite operacional.`, category: "omnichannel", sourceKind: "integration_lag", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  }
  if (item.inbox.deadLetter + item.outbox.deadLetter > 0) {
    result.push({ fingerprint: `${base}:dead_letter`, severity: "P1", title: "Fila omnichannel exige intervenção", summary: `${item.inbox.deadLetter} evento(s) e ${item.outbox.deadLetter} comando(s) em dead-letter.`, category: "omnichannel", sourceKind: "integration_dead_letter", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  }
  if (item.divergenceCount > 0) {
    result.push({ fingerprint: `${base}:divergence`, severity: "P1", title: "Pedido externo divergente", summary: `${item.divergenceCount} pedido(s) estão em retry/attention e precisam de reconciliação.`, category: "omnichannel", sourceKind: "integration_divergence", sourceReference: reference, organizationId: item.organizationId, storeId: item.storeId });
  }
  return result;
}
