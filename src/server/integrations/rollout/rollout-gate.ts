export type RolloutProvider = "ifood" | "99food" | "99entrega";
export type RolloutTarget = "canary" | "general";
export type RolloutScenario =
  | "native_baseline"
  | "core_resilience"
  | "structural_integrity"
  | "provider_sandbox"
  | "official_homologation"
  | "security"
  | "canary_observation"
  | "rollback_verified";

export type DuplicateCounters = {
  orders: number;
  prints: number;
  charges: number;
  deliveries: number;
};

export type RolloutEvidence = {
  scenario: RolloutScenario;
  passed: boolean;
  environment: "sandbox" | "production";
  buildCommit: string;
  evidenceRef: string;
  provider: RolloutProvider;
  capability: string;
  storeId: string;
  merchantRefSanitized: string | null;
  externalOrderRefSanitized: string | null;
  internalOrderId: string | null;
  eventTypes: string[];
  actions: string[];
  printJobId: string | null;
  divergenceCount: number;
  duplicates: DuplicateCounters;
  nativeIsolationPassed: boolean;
  tenantIsolationPassed: boolean;
  recordedAt: string;
};

export type RolloutReadiness = {
  ready: boolean;
  target: RolloutTarget;
  blockers: string[];
  completedScenarios: RolloutScenario[];
  missingScenarios: RolloutScenario[];
  p0DuplicateDetected: boolean;
  requiresExplicitApproval: true;
};

const BASE_SCENARIOS: RolloutScenario[] = [
  "native_baseline",
  "core_resilience",
  "structural_integrity",
  "provider_sandbox",
  "official_homologation",
  "security",
];

const GENERAL_ONLY_SCENARIOS: RolloutScenario[] = ["canary_observation", "rollback_verified"];

function requiredScenarios(target: RolloutTarget): RolloutScenario[] {
  return target === "general"
    ? [...BASE_SCENARIOS, ...GENERAL_ONLY_SCENARIOS]
    : BASE_SCENARIOS;
}

function hasP0Duplicates(evidence: RolloutEvidence[]): boolean {
  return evidence.some(({ duplicates }) =>
    duplicates.orders > 0 || duplicates.prints > 0 || duplicates.charges > 0 || duplicates.deliveries > 0,
  );
}

export function evaluateRolloutReadiness(input: {
  provider: RolloutProvider;
  capability: string;
  storeId: string;
  target: RolloutTarget;
  evidence: RolloutEvidence[];
}): RolloutReadiness {
  const blockers: string[] = [];

  if (input.provider === "ifood" && input.capability === "ifood_catalog") {
    blockers.push("iFood Catalog permanece indisponível por decisão de produto: cardápio e preços do PedeAqui são independentes.");
  }

  const scoped = input.evidence.filter((item) =>
    item.provider === input.provider
    && item.capability === input.capability
    && item.storeId === input.storeId,
  );
  const required = requiredScenarios(input.target);
  const passedScenarios = new Set(
    scoped.filter((item) => item.passed).map((item) => item.scenario),
  );
  const missingScenarios = required.filter((scenario) => !passedScenarios.has(scenario));

  for (const scenario of missingScenarios) blockers.push(`Evidência obrigatória ausente ou falha: ${scenario}.`);

  const failedRequired = scoped.filter((item) => required.includes(item.scenario) && !item.passed);
  for (const item of failedRequired) blockers.push(`Cenário ${item.scenario} registrado como falha (${item.evidenceRef}).`);

  const p0DuplicateDetected = hasP0Duplicates(scoped);
  if (p0DuplicateDetected) {
    blockers.push("P0: foi detectada duplicidade de pedido, impressão, cobrança ou contratação de entrega.");
  }
  if (scoped.some((item) => !item.nativeIsolationPassed)) {
    blockers.push("Provider degradado afetou ou não provou isolamento do canal nativo.");
  }
  if (scoped.some((item) => !item.tenantIsolationPassed)) {
    blockers.push("Isolamento entre tenants não foi comprovado.");
  }
  if (scoped.some((item) => item.divergenceCount > 0 && item.passed)) {
    blockers.push("Há divergência registrada em cenário marcado como aprovado.");
  }

  return {
    ready: blockers.length === 0,
    target: input.target,
    blockers,
    completedScenarios: required.filter((scenario) => passedScenarios.has(scenario)),
    missingScenarios,
    p0DuplicateDetected,
    requiresExplicitApproval: true,
  };
}

export function assertEvidenceIsSafe(evidence: RolloutEvidence): void {
  const tokenLike = /(token|secret|password|authorization|payload|customer|phone|email|address|latitude|longitude)/i;
  const values = [
    evidence.buildCommit,
    evidence.evidenceRef,
    evidence.merchantRefSanitized ?? "",
    evidence.externalOrderRefSanitized ?? "",
    ...evidence.eventTypes,
    ...evidence.actions,
  ];
  if (values.some((value) => tokenLike.test(value))) {
    throw new Error("Rollout evidence contains a forbidden secret/PII-like field or value.");
  }
  if (!/^[a-f0-9]{7,40}$/i.test(evidence.buildCommit)) {
    throw new Error("Rollout evidence must reference a Git commit SHA.");
  }
  if (!evidence.evidenceRef.trim()) throw new Error("Rollout evidence reference is required.");
  if (evidence.divergenceCount < 0) throw new Error("Divergence count cannot be negative.");
  for (const count of Object.values(evidence.duplicates)) {
    if (!Number.isInteger(count) || count < 0) throw new Error("Duplicate counters must be non-negative integers.");
  }
}
