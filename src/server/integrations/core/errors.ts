export type IntegrationErrorKind = "provider" | "configuration" | "pedeaqui";

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly kind: IntegrationErrorKind,
    readonly retryable: boolean,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "IntegrationError";
  }
}

export class IntegrationProviderError extends IntegrationError {
  constructor(message: string, code = "provider_error", retryable = false, options?: ErrorOptions) {
    super(message, "provider", retryable, code, options);
    this.name = "IntegrationProviderError";
  }
}

export class IntegrationConfigurationError extends IntegrationError {
  constructor(message: string, code = "integration_configuration", options?: ErrorOptions) {
    super(message, "configuration", false, code, options);
    this.name = "IntegrationConfigurationError";
  }
}

export class PedeAquiIntegrationError extends IntegrationError {
  constructor(message: string, code = "pedeaqui_integration", retryable = false, options?: ErrorOptions) {
    super(message, "pedeaqui", retryable, code, options);
    this.name = "PedeAquiIntegrationError";
  }
}

export function classifyIntegrationError(error: unknown): IntegrationError {
  if (error instanceof IntegrationError) return error;
  return new PedeAquiIntegrationError(
    error instanceof Error ? error.message : "Unknown integration error",
    "unexpected_integration_error",
    false,
    error instanceof Error ? { cause: error } : undefined,
  );
}
