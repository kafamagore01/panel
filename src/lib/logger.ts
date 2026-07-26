import crypto from "node:crypto";

const SECRET_PATTERN =
  /(postgres(?:ql)?:\/\/)[^@\s]+@|((?:token|password|secret|authorization)[=:]\s*)[^\s,;]+/gi;

function safeMessage(error: unknown): {
  error_name: string;
  error_code?: string;
  error_message: string;
} {
  if (!(error instanceof Error)) {
    return {
      error_name: "UnknownError",
      error_message: "Bilinmeyen hata",
    };
  }
  const code =
    "code" in error && typeof error.code === "string"
      ? error.code.slice(0, 80)
      : undefined;
  return {
    error_name: error.name.slice(0, 80),
    ...(code ? { error_code: code } : {}),
    error_message: error.message
      .replace(SECRET_PATTERN, (_match, protocol, label) =>
        protocol ? `${protocol}[REDACTED]@` : `${label}[REDACTED]`
      )
      .slice(0, 500),
  };
}

export function structuredErrorRecord(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const requestId =
    typeof context.request_id === "string" && context.request_id
      ? context.request_id
      : crypto.randomUUID();
  return {
    level: "error",
    event,
    request_id: requestId,
    timestamp: new Date().toISOString(),
    ...context,
    ...safeMessage(error),
  };
}

export function logError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  console.error(JSON.stringify(structuredErrorRecord(event, error, context)));
}
