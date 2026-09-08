export type CapabilityApprovalMap = Record<string, boolean>;

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

export function productionCapabilityApprovalsForStore(
  metadata: unknown,
  storeId: string,
): CapabilityApprovalMap {
  const root = objectValue(objectValue(metadata).production_capability_approvals);
  const scoped = objectValue(root[storeId]);
  return Object.fromEntries(
    Object.entries(scoped).map(([capability, approved]) => [capability, approved === true]),
  );
}

export function isProductionCapabilityApproved(
  metadata: unknown,
  storeId: string,
  capability: string,
): boolean {
  return productionCapabilityApprovalsForStore(metadata, storeId)[capability] === true;
}

export function withProductionCapabilityApproval(
  metadata: unknown,
  storeId: string,
  capability: string,
  approved: boolean,
): JsonObject {
  const currentMetadata = objectValue(metadata);
  const currentRoot = objectValue(currentMetadata.production_capability_approvals);
  const currentStore = objectValue(currentRoot[storeId]);
  return {
    ...currentMetadata,
    production_capability_approvals: {
      ...currentRoot,
      [storeId]: {
        ...currentStore,
        [capability]: approved,
      },
    },
  };
}

export function generalRolloutApprovalsForStore(
  metadata: unknown,
  storeId: string,
): CapabilityApprovalMap {
  const root = objectValue(objectValue(metadata).general_rollout_approvals);
  const scoped = objectValue(root[storeId]);
  return Object.fromEntries(
    Object.entries(scoped).map(([capability, approved]) => [capability, approved === true]),
  );
}

export function withGeneralRolloutApproval(
  metadata: unknown,
  storeId: string,
  capability: string,
  approved: boolean,
): JsonObject {
  const currentMetadata = objectValue(metadata);
  const currentRoot = objectValue(currentMetadata.general_rollout_approvals);
  const currentStore = objectValue(currentRoot[storeId]);
  return {
    ...currentMetadata,
    general_rollout_approvals: {
      ...currentRoot,
      [storeId]: {
        ...currentStore,
        [capability]: approved,
      },
    },
  };
}
