import { classifyIntegrationError, type IntegrationError } from "@/server/integrations/core/errors";

export type RetryDisposition =
  | { action: "retry"; availableAt: string; delayMs: number; error: IntegrationError }
  | { action: "dead_letter"; error: IntegrationError };

export type RetryPolicyInput = {
  error: unknown;
  attempts: number;
  now?: Date;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryAfterMs?: number | null;
  jitter?: number;
};

export function decideIntegrationRetry(input: RetryPolicyInput): RetryDisposition {
  const error = classifyIntegrationError(input.error);
  const attempts = Math.max(1, input.attempts);
  const maxAttempts = Math.max(1, input.maxAttempts ?? 8);

  if (!error.retryable || attempts >= maxAttempts) {
    return { action: "dead_letter", error };
  }

  const baseDelayMs = Math.max(250, input.baseDelayMs ?? 1_000);
  const maxDelayMs = Math.max(baseDelayMs, input.maxDelayMs ?? 5 * 60_000);
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempts - 1));
  const boundedJitter = Math.min(1, Math.max(0, input.jitter ?? 0.2));
  const deterministicJitter = exponential * boundedJitter * (((attempts * 17) % 11) / 10);
  const policyDelay = Math.round(exponential + deterministicJitter);
  const retryAfterMs = Math.max(0, input.retryAfterMs ?? 0);
  const delayMs = Math.max(policyDelay, retryAfterMs);
  const now = input.now ?? new Date();

  return {
    action: "retry",
    delayMs,
    availableAt: new Date(now.getTime() + delayMs).toISOString(),
    error,
  };
}
