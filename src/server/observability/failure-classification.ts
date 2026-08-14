export type FailureKind = "validation" | "session" | "permission" | "conflict" | "rate_limit" | "timeout" | "dependency" | "internal";
export type FailureClassification = { kind: FailureKind; retryable: boolean; userMessage: string };

const userMessages: Record<FailureKind, string> = {
  validation: "Revise os dados informados e tente novamente.",
  session: "Sua sessão não é válida. Entre novamente para continuar.",
  permission: "Você não tem permissão para concluir esta operação.",
  conflict: "Os dados foram alterados. Atualize a tela e tente novamente.",
  rate_limit: "O serviço está ocupado. Tente novamente em instantes.",
  timeout: "O serviço demorou mais que o esperado. Tente novamente em instantes.",
  dependency: "Um serviço necessário está indisponível no momento. Tente novamente em instantes.",
  internal: "Não foi possível concluir a operação. Tente novamente.",
};

function statusOf(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const value = (error as { status?: unknown; statusCode?: unknown }).status ?? (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

export function failureCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const candidate = error as { code?: unknown; name?: unknown };
  if (typeof candidate.code === "string" && candidate.code.length <= 80) return candidate.code;
  if (typeof candidate.name === "string" && candidate.name.length <= 80) return candidate.name;
  return "UNKNOWN";
}

export function classifyFailure(error: unknown): FailureClassification {
  const status = statusOf(error);
  const code = failureCode(error).toLowerCase();
  if (status === 400 || status === 422 || /validation|invalid|parse/.test(code)) return { kind: "validation", retryable: false, userMessage: userMessages.validation };
  if (status === 401 || /session|authentication/.test(code)) return { kind: "session", retryable: false, userMessage: userMessages.session };
  if (status === 403 || /forbidden|permission/.test(code)) return { kind: "permission", retryable: false, userMessage: userMessages.permission };
  if (status === 409 || /conflict|duplicate/.test(code)) return { kind: "conflict", retryable: false, userMessage: userMessages.conflict };
  if (status === 429 || /rate.?limit|too.?many/.test(code)) return { kind: "rate_limit", retryable: true, userMessage: userMessages.rate_limit };
  if (status === 408 || status === 504 || /timeout|abort/.test(code)) return { kind: "timeout", retryable: true, userMessage: userMessages.timeout };
  if ((status !== null && status >= 500) || /fetch|network|provider|dependency/.test(code)) return { kind: "dependency", retryable: true, userMessage: userMessages.dependency };
  return { kind: "internal", retryable: false, userMessage: userMessages.internal };
}
