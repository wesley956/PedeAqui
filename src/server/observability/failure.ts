import "server-only";
import { classifyFailure, failureCode } from "@/server/observability/failure-classification";
import { logger } from "@/server/observability/logger";

type FailureContext = Record<string, unknown> & { requestId: string; organizationId?: string; storeId?: string | null; userId?: string };

export function recordFailure(event: string, error: unknown, context: FailureContext) {
  const classification = classifyFailure(error);
  const details = {
    ...context,
    failureKind: classification.kind,
    retryable: classification.retryable,
    errorType: error instanceof Error ? error.name : typeof error,
    errorCode: failureCode(error),
  };
  if (classification.retryable) logger.warn(event, details);
  else logger.error(event, details);
  return classification;
}
