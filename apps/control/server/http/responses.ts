import { z } from "zod";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

const problemTitles: Record<number, string> = {
  400: "Invalid request",
  401: "Authentication required",
  403: "Access denied",
  404: "Resource not found",
  409: "Conflict",
  500: "Internal server error",
  503: "Service unavailable",
};

const problemCodes: Record<number, string> = {
  400: "invalid_request",
  401: "authentication_required",
  403: "access_denied",
  404: "resource_not_found",
  409: "conflict",
  500: "internal_error",
  503: "service_unavailable",
};

export interface ProblemResponseOptions {
  authorization?: {
    capability?: string;
    decision: "DENY" | "APPROVAL_REQUIRED";
    policyId?: string;
    reason?: string;
  };
  code?: string;
  errors?: Array<{ code: string; message: string; path: string }>;
  headers?: HeadersInit;
  instance?: string;
  title?: string;
}

/** RFC 9457 response used by every business API failure. */
export function problemResponse(
  status: number,
  detail: string,
  options: ProblemResponseOptions = {},
): Response {
  const code = options.code ?? problemCodes[status] ?? "request_failed";
  return jsonResponse(
    {
      type: `urn:tali:problem:${code}`,
      title: options.title ?? problemTitles[status] ?? "Request failed",
      status,
      detail,
      code,
      ...(options.instance ? { instance: options.instance } : {}),
      ...(options.errors ? { errors: options.errors } : {}),
      ...(options.authorization ? { authorization: options.authorization } : {}),
    },
    {
      status,
      headers: {
        "content-type": "application/problem+json; charset=utf-8",
        ...Object.fromEntries(new Headers(options.headers)),
      },
    },
  );
}

function statusForMessage(message: string): number {
  return /not found/i.test(message)
    ? 404
    : /access denied|do not have permission/i.test(message)
      ? 403
      : /Invalid |must be|required when|before end_time/i.test(message)
        ? 400
        : /Consumer|in use|already exists|already connected|connected to a Coordinator|cannot delegate|does not accept delegated|Only a READY Agent|managed by TaskLattice Relay|immutable|digest does not match|cannot be changed|default Model Routing|compliance|suspended|READY Model Routing|Multiple default|quota exceeded|Online SSO changes require/i.test(message)
          ? 409
          : /LiteLLM|gateway is unavailable|SMTP|invitation delivery|OIDC discovery|OIDC JWKS/i.test(message)
            ? 503
            : 500;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return problemResponse(400, error.issues[0]?.message ?? "Invalid request.", {
      code: "validation_failed",
      errors: error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: `/${issue.path.map(String).join("/")}`,
      })),
    });
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  const evidence = error && typeof error === "object" && "evidence" in error
    ? (error as { evidence?: {
        capability?: string;
        decision?: string;
        policyId?: string;
        reason?: string;
      } }).evidence
    : undefined;
  if (evidence?.decision === "DENY" || evidence?.decision === "APPROVAL_REQUIRED") {
    return problemResponse(403, message, {
      code: evidence.decision === "APPROVAL_REQUIRED"
        ? "approval_required"
        : "capability_denied",
      authorization: {
        decision: evidence.decision,
        ...(evidence.capability ? { capability: evidence.capability } : {}),
        ...(evidence.policyId ? { policyId: evidence.policyId } : {}),
        ...(evidence.reason ? { reason: evidence.reason } : {}),
      },
    });
  }
  const status = statusForMessage(message);
  if (status >= 500) console.error(error);
  return problemResponse(status, message);
}

export function noContentResponse(init: ResponseInit = {}): Response {
  return new Response(null, { ...init, status: 204 });
}
