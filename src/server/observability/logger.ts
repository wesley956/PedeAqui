import { redactSensitive } from "@/server/observability/redact";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown> & {
  requestId?: string;
  organizationId?: string;
  storeId?: string | null;
  userId?: string;
};

const rank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level === "debug" || level === "warn" || level === "error" ? level : "info";
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  if (rank[level] < rank[configuredLevel()]) return;

  const record = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redactSensitive(context) as Record<string, unknown>,
  };

  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
