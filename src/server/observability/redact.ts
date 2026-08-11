const SENSITIVE_KEY = /(password|passwd|secret|token|authorization|cookie|service[_-]?role|api[_-]?key|card[_-]?number|cvv)/i;

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactSensitive(nested),
      ]),
    );
  }

  return value;
}
