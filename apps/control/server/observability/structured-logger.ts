export type StructuredLogLevel = "debug" | "error" | "info" | "warn";

export interface StructuredLogger {
  log(
    level: StructuredLogLevel,
    event: string,
    fields?: Record<string, unknown>,
  ): void;
}

function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      ...(error.stack ? { errorStack: error.stack } : {}),
    };
  }
  return { errorMessage: String(error) };
}

export function serializeError(error: unknown): Record<string, unknown> {
  return errorFields(error);
}

export function createStructuredLogger(
  component: string,
  baseFields: Record<string, unknown> = {},
): StructuredLogger {
  return {
    log(level, event, fields = {}) {
      const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        component,
        event,
        ...baseFields,
        ...fields,
      });
      if (level === "error") console.error(payload);
      else if (level === "warn") console.warn(payload);
      else if (level === "debug") console.debug(payload);
      else console.info(payload);
    },
  };
}
